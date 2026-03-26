package routes

import (
	"encoding/json"

	"github.com/gin-gonic/gin"

	"cloud/internal/auth"
	"cloud/internal/db"
)

func SetupPreferencesRoutes(r *gin.Engine) {
	api := r.Group("/api")

	// GET /api/preferences
	api.GET("/preferences", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		prefs, _ := db.GetPreferences(user.ID)

		var hudState interface{}
		if err := json.Unmarshal([]byte(prefs.HudState), &hudState); err != nil {
			hudState = map[string]interface{}{}
		}
		var tutorialsCompleted interface{}
		if err := json.Unmarshal([]byte(prefs.TutorialsCompleted), &tutorialsCompleted); err != nil {
			tutorialsCompleted = map[string]interface{}{}
		}

		c.JSON(200, gin.H{
			"nightMode":          prefs.NightMode == 1,
			"terminalTheme":      prefs.TerminalTheme,
			"notificationSound":  prefs.NotificationSound == 1,
			"autoRemoveDone":     prefs.AutoRemoveDone == 1,
			"canvasBg":           prefs.CanvasBg,
			"snoozeDuration":     prefs.SnoozeDuration,
			"terminalFont":       prefs.TerminalFont,
			"focusMode":          prefs.FocusMode,
			"hudState":           hudState,
			"tutorialsCompleted": tutorialsCompleted,
		})
	})

	// PUT /api/preferences
	api.PUT("/preferences", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		var body db.PreferencesInput
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Invalid request body"})
			return
		}
		if err := db.SavePreferences(user.ID, body); err != nil {
			c.JSON(500, gin.H{"error": "Failed to save preferences"})
			return
		}
		c.JSON(200, gin.H{"ok": true})
	})
}
