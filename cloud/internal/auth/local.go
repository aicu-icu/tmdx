package auth

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"

	"cloud/internal/config"
	"cloud/internal/db"
)

var usernameRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]{3,32}$`)

func SetupLocalAuth(r *gin.Engine) {
	// POST /auth/register
	r.POST("/auth/register", func(c *gin.Context) {
		var body struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
			return
		}

		username := strings.TrimSpace(body.Username)
		if !usernameRegex.MatchString(username) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Username must be 3-32 characters, only letters, digits, hyphens, underscores"})
			return
		}

		if len(body.Password) < 6 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Password must be at least 6 characters"})
			return
		}

		// Check if username already taken
		existing, _ := db.GetUserByUsername(username)
		if existing != nil {
			c.JSON(http.StatusConflict, gin.H{"error": "Username already taken"})
			return
		}

		// First user becomes admin
		role := "user"
		count, _ := db.CountUsers()
		if count == 0 {
			role = "admin"
		}

		hash, err := HashPassword(body.Password)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
			return
		}

		user, err := db.CreateLocalUser(username, hash, role)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
			return
		}

		accessToken, _ := IssueAccessToken(user.ID, user.Username, user.Tier)
		refreshToken, _ := IssueRefreshToken(user.ID)
		setAuthCookies(c, accessToken, refreshToken)

		c.JSON(http.StatusOK, gin.H{"ok": true, "userId": user.ID, "role": user.Role})
	})

	// POST /auth/login
	r.POST("/auth/login", func(c *gin.Context) {
		var body struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
			return
		}

		username := strings.TrimSpace(body.Username)
		if username == "" || body.Password == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Username and password are required"})
			return
		}

		user, _ := db.GetUserByUsername(username)
		if user == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid username or password"})
			return
		}

		hash, _ := db.GetUserPasswordHash(username)
		if hash == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid username or password"})
			return
		}

		if !CheckPassword(body.Password, hash) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid username or password"})
			return
		}

		accessToken, _ := IssueAccessToken(user.ID, user.Username, user.Tier)
		refreshToken, _ := IssueRefreshToken(user.ID)
		setAuthCookies(c, accessToken, refreshToken)

		db.RecordEvent("user.login", &user.ID, map[string]interface{}{
			"username": user.Username,
		})

		c.JSON(http.StatusOK, gin.H{"ok": true, "userId": user.ID})
	})

	// POST /auth/logout
	r.POST("/auth/logout", func(c *gin.Context) {
		clearAuthCookies(c)
		c.Redirect(http.StatusFound, "/login")
	})

	// GET /auth/logout
	r.GET("/auth/logout", func(c *gin.Context) {
		clearAuthCookies(c)
		c.Redirect(http.StatusFound, "/login")
	})
}

func setAuthCookies(c *gin.Context, accessToken, refreshToken string) {
	cfg := config.Get()
	http.SetCookie(c.Writer, &http.Cookie{
		Name: "tc_access", Value: accessToken, MaxAge: 3600, Path: "/",
		HttpOnly: true, Secure: cfg.IsProduction, SameSite: http.SameSiteLaxMode,
	})
	http.SetCookie(c.Writer, &http.Cookie{
		Name: "tc_refresh", Value: refreshToken, MaxAge: 7 * 24 * 3600, Path: "/",
		HttpOnly: true, Secure: cfg.IsProduction, SameSite: http.SameSiteLaxMode,
	})
}

func clearAuthCookies(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{Name: "tc_access", Value: "", MaxAge: -1, Path: "/"})
	http.SetCookie(c.Writer, &http.Cookie{Name: "tc_refresh", Value: "", MaxAge: -1, Path: "/"})
}
