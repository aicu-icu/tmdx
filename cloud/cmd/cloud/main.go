package main

import (
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/gin-gonic/gin"

	"cloud/internal/auth"
	"cloud/internal/config"
	"cloud/internal/db"
	"cloud/internal/routes"
	"cloud/internal/static"
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

func printHelp() {
	fmt.Printf(`tmdx Cloud v%s

Usage: tmd-cloud [options]

Options:
  --debug       Enable Gin debug logging
  --version, -v Show version
  --help, -h    Show this help
`, version.Version)
}
