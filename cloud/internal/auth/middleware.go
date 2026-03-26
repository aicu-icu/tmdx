package auth

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"cloud/internal/db"
)

// RequireAuth is Gin middleware that requires a valid JWT.
func RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Try access token
		accessToken, _ := c.Cookie("tc_access")
		if accessToken != "" {
			claims, err := VerifyToken(accessToken)
			if err == nil {
				user, err := db.GetUserByID(claims.Sub)
				if err == nil && user != nil {
					c.Set("user", user)
					c.Next()
					return
				}
			}
			// If token is malformed (not expired), reject
			if err != nil && !strings.Contains(err.Error(), "expired") {
				sendUnauthorized(c)
				return
			}
		}

		// Try refresh token
		refreshToken, _ := c.Cookie("tc_refresh")
		if refreshToken != "" {
			claims, err := VerifyToken(refreshToken)
			if err == nil && claims.Type == "refresh" {
				user, err := db.GetUserByID(claims.Sub)
				if err == nil && user != nil {
					// Issue new access token
					newToken, err := IssueAccessToken(user.ID, user.Username, user.Tier)
					if err == nil {
						http.SetCookie(c.Writer, &http.Cookie{
							Name:     "tc_access",
							Value:    newToken,
							MaxAge:   3600,
							Path:     "/",
							HttpOnly: true,
							SameSite: http.SameSiteLaxMode,
						})
					}
					c.Set("user", user)
					c.Next()
					return
				}
			}
		}

		// No valid token
		sendUnauthorized(c)
	}
}

func sendUnauthorized(c *gin.Context) {
	if strings.HasPrefix(c.Request.URL.Path, "/api/") ||
		strings.HasPrefix(c.Request.URL.Path, "/auth/") ||
		c.GetHeader("Accept") == "application/json" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized", "message": "Please log in."})
	} else {
		c.Redirect(http.StatusFound, "/login")
	}
	c.Abort()
}

func GetUser(c *gin.Context) *db.User {
	if u, exists := c.Get("user"); exists {
		if user, ok := u.(*db.User); ok {
			return user
		}
	}
	return nil
}
