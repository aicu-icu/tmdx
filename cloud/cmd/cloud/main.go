package main

import (
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	"cloud/internal/auth"
	"cloud/internal/config"
	"cloud/internal/db"
	"cloud/internal/routes"
	"cloud/internal/static"
	"cloud/internal/update"
	"cloud/internal/version"
	"cloud/internal/ws"
)

func main() {
	args := os.Args[1:]

	// CLI flags
	debug := false
	for _, a := range args {
		switch a {
		case "--version", "-v":
			fmt.Printf("tmdx Cloud v%s\n", version.Version)
			return
		case "--help", "-h":
			printHelp()
			return
		case "--debug":
			debug = true
		case "--update":
			handleUpdate()
			return
		}
	}

	cfg := config.Load()

	// Initialize database
	if err := db.Init(cfg.DBPath); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	// Set Gin mode — default to Release, --debug overrides
	if debug {
		gin.SetMode(gin.DebugMode)
	} else {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()

	// Embedded static file system rooted at public/
	subFS, err := fs.Sub(static.Files, "public")
	if err != nil {
		log.Fatalf("Failed to create sub filesystem: %v", err)
	}
	httpFS := http.FS(subFS)

	// Landing page routing (hostname-based)
	if cfg.LandingDir != "" && cfg.AppHost != "" {
		setupLandingRoutes(r, cfg)
	}

	// Auth routes (public)
	auth.SetupLocalAuth(r)

	// Login page (public)
	r.GET("/login", func(c *gin.Context) {
		c.FileFromFS("/login.html", httpFS)
	})

	// API routes (protected)
	routes.SetupApiRoutes(r)

	// Layout persistence routes
	routes.SetupLayoutRoutes(r)

	// Todo routes
	routes.SetupTodoRoutes(r)

	// User preferences routes
	routes.SetupPreferencesRoutes(r)

	// Analytics routes
	routes.SetupAnalyticsRoutes(r)

	// Main app entry point (auth required)
	r.GET("/", auth.RequireAuth(), func(c *gin.Context) {
		c.FileFromFS("/", httpFS)
	})

	// Static assets — uses NoRoute to serve all embedded public/ files
	// without conflicting with specific routes (/, /api/*, /auth/*, /dl/*).
	r.NoRoute(func(c *gin.Context) {
		if c.Request.Method != "GET" {
			c.AbortWithStatus(404)
			return
		}
		p := c.Request.URL.Path
		// Try to serve from embedded FS
		if f, err := subFS.Open(p[1:]); err == nil {
			f.Close()
			c.FileFromFS(p, httpFS)
			return
		}
		// Unmatched routes redirect to login
		c.Redirect(302, "/login")
	})

	// Tutorial page (no auth)
	r.GET("/tutorial", func(c *gin.Context) {
		c.FileFromFS("/tutorial.html", httpFS)
	})

	// Pair page (auth required)
	r.GET("/pair", auth.RequireAuth(), func(c *gin.Context) {
		c.FileFromFS("/pair.html", httpFS)
	})

	// WebSocket relay
	relay := ws.NewRelay()
	relay.Setup(r)

	fmt.Printf("[cloud] tmdx Cloud Server v%s\n", version.Version)
	fmt.Printf("[cloud] Listening on http://%s:%d\n", cfg.Host, cfg.Port)
	fmt.Printf("[cloud] Mode: %s\n", gin.Mode())

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)

	// Graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		if err := r.Run(addr); err != nil {
			log.Fatalf("Server error: %v", err)
		}
	}()

	<-sigChan
	fmt.Println("\n[cloud] Shutting down...")
}

func setupLandingRoutes(r *gin.Engine, cfg *config.Config) {
	vanityRedirects := map[string]string{
		"/twitter": "twitter", "/x": "twitter", "/github": "github",
		"/reddit": "reddit", "/hn": "hackernews", "/hackernews": "hackernews",
		"/linkedin": "linkedin", "/youtube": "youtube", "/yt": "youtube",
		"/discord": "discord",
	}

	r.Use(func(c *gin.Context) {
		host := c.Request.Host
		if host == cfg.AppHost {
			c.Next()
			return
		}

		// Vanity redirects
		if source, ok := vanityRedirects[c.Request.URL.Path]; ok {
			c.Redirect(302, "/?utm_source="+source)
			c.Abort()
			return
		}
	})
}

func formatSize(bytes int64) string {
	const (
		KB = 1024
		MB = KB * 1024
	)
	if bytes >= MB {
		return fmt.Sprintf("%.1f MB", float64(bytes)/float64(MB))
	}
	if bytes >= KB {
		return fmt.Sprintf("%.1f KB", float64(bytes)/float64(KB))
	}
	return fmt.Sprintf("%d B", bytes)
}

func formatSpeed(bytesPerSec float64) string {
	const (
		KB = 1024
		MB = KB * 1024
	)
	if bytesPerSec >= MB {
		return fmt.Sprintf("%.1f MB/s", bytesPerSec/MB)
	}
	if bytesPerSec >= KB {
		return fmt.Sprintf("%.1f KB/s", bytesPerSec/KB)
	}
	return fmt.Sprintf("%.0f B/s", bytesPerSec)
}

func handleUpdate() {
	currentVersion := version.Version
	if currentVersion == "dev" {
		fmt.Println("[cloud] Development build, cannot update.")
		return
	}

	fmt.Println("[cloud] Checking for updates...")

	info, err := update.CheckLatest()
	if err != nil {
		fmt.Fprintf(os.Stderr, "[cloud] Failed to check for updates: %v\n", err)
		os.Exit(1)
	}

	if !info.HasAsset {
		fmt.Fprintf(os.Stderr, "[cloud] No release asset found for this platform\n")
		os.Exit(1)
	}

	if !update.IsVersionOutdated(currentVersion, info.Version) {
		fmt.Printf("[cloud] Already up to date (v%s)\n", currentVersion)
		return
	}

	fmt.Printf("[cloud] New version available: v%s \u2192 v%s\n", currentVersion, info.Version)
	if info.Size > 0 {
		fmt.Printf("[cloud] Downloading update (%s)...\n", formatSize(info.Size))
	} else {
		fmt.Printf("[cloud] Downloading update...\n")
	}

	startTime := time.Now()
	var lastPrinted int64

	onProgress := func(downloaded, total int64) {
		if downloaded-lastPrinted < 65536 && downloaded < total {
			return
		}
		lastPrinted = downloaded
		elapsed := time.Since(startTime).Seconds()
		speed := float64(downloaded) / elapsed
		barWidth := 24
		var pct float64
		if total > 0 {
			pct = float64(downloaded) / float64(total) * 100
			filled := int(pct / 100 * float64(barWidth))
			bar := ""
			for i := 0; i < barWidth; i++ {
				if i < filled {
					bar += "\u2588"
				} else {
					bar += "\u2591"
				}
			}
			fmt.Printf("\r[cloud] [%s] %5.1f%% (%s / %s) %s", bar, pct, formatSize(downloaded), formatSize(total), formatSpeed(speed))
		} else {
			fmt.Printf("\r[cloud] Downloaded %s %s", formatSize(downloaded), formatSpeed(speed))
		}
	}

	if err := update.DownloadAndReplace(info.DownloadURL, onProgress); err != nil {
		fmt.Fprintf(os.Stderr, "\n[cloud] Update failed: %v\n", err)
		os.Exit(1)
	}

	elapsed := time.Since(startTime).Seconds()
	speed := float64(info.Size) / elapsed
	fmt.Printf("\n[cloud] Download complete (%s in %.1fs, %s)\n", formatSize(info.Size), elapsed, formatSpeed(speed))
	fmt.Printf("[cloud] Updated successfully to v%s\n", info.Version)
}

func printHelp() {
	fmt.Printf(`tmdx Cloud v%s

Usage: tmd-cloud [options]

Options:
  --debug       Enable Gin debug logging
  --update      Check for and install updates
  --version, -v Show version
  --help, -h    Show this help
`, version.Version)
}
