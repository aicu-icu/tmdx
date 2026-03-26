package routes

import (
	"fmt"
	"strconv"

	"github.com/gin-gonic/gin"

	"cloud/internal/auth"
	"cloud/internal/billing"
	"cloud/internal/db"
)

func SetupLayoutRoutes(r *gin.Engine) {
	api := r.Group("/api")

	// =====================
	// LAYOUTS
	// =====================

	// GET /api/layouts
	api.GET("/layouts", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		layouts, err := db.GetLayoutsByUser(user.ID)
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to load layouts"})
			return
		}
		c.JSON(200, gin.H{"layouts": layouts})
	})

	// PUT /api/layouts
	api.PUT("/layouts", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		var body struct {
			Panes []db.SavePane `json:"panes"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.Panes == nil {
			c.JSON(400, gin.H{"error": "panes array is required"})
			return
		}
		if err := db.SaveFullLayout(user.ID, body.Panes); err != nil {
			c.JSON(500, gin.H{"error": "Failed to save layouts"})
			return
		}
		c.JSON(200, gin.H{"ok": true, "count": len(body.Panes)})
	})

	// PATCH /api/layouts/:paneId
	api.PATCH("/layouts/:paneId", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		var updates map[string]interface{}
		c.ShouldBindJSON(&updates)
		db.UpdatePaneLayout(user.ID, c.Param("paneId"), updates)
		c.JSON(200, gin.H{"ok": true})
	})

	// PUT /api/layouts/:paneId
	api.PUT("/layouts/:paneId", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		var body db.SavePane
		c.ShouldBindJSON(&body)
		body.ID = c.Param("paneId")
		db.UpsertPaneLayout(user.ID, body)
		c.JSON(200, gin.H{"ok": true})
	})

	// DELETE /api/layouts/:paneId
	api.DELETE("/layouts/:paneId", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		db.DeletePaneLayout(user.ID, c.Param("paneId"))
		c.JSON(200, gin.H{"ok": true})
	})

	// =====================
	// CLOUD-SYNCED NOTES
	// =====================

	// GET /api/cloud-notes
	api.GET("/cloud-notes", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		notes, err := db.GetNotesByUser(user.ID)
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to load notes"})
			return
		}
		c.JSON(200, gin.H{"notes": notes})
	})

	// GET /api/cloud-notes/:id
	api.GET("/cloud-notes/:id", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		note, err := db.GetNoteByID(user.ID, c.Param("id"))
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to load note"})
			return
		}
		if note == nil {
			c.JSON(404, gin.H{"error": "Note not found"})
			return
		}
		c.JSON(200, note)
	})

	// PUT /api/cloud-notes/:id
	api.PUT("/cloud-notes/:id", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		var body struct {
			Content  *string  `json:"content"`
			FontSize *int     `json:"fontSize"`
			Images   []string `json:"images"`
		}
		c.ShouldBindJSON(&body)

		// Image limit check
		if len(body.Images) > 0 {
			existing, _ := db.GetNoteByID(user.ID, c.Param("id"))
			existingCount := 0
			if existing != nil {
				existingCount = len(existing.Images)
			}
			newCount := len(body.Images) - existingCount
			if newCount > 0 {
				if blocked := billing.CheckImageLimit(user.ID, newCount); blocked != nil {
					c.JSON(403, gin.H{"error": blocked.Message, "upgradeUrl": blocked.UpgradeURL})
					return
				}
			}
		}

		content := ""
		if body.Content != nil {
			content = *body.Content
		}
		fontSize := 14
		if body.FontSize != nil {
			fontSize = *body.FontSize
		}

		if err := db.UpsertNote(user.ID, c.Param("id"), content, fontSize, body.Images); err != nil {
			fmt.Printf("[api] Error saving note: %v\n", err)
			c.JSON(500, gin.H{"error": "Failed to save note"})
			return
		}
		c.JSON(200, gin.H{"ok": true})
	})

	// DELETE /api/cloud-notes/:id
	api.DELETE("/cloud-notes/:id", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		db.DeleteNote(user.ID, c.Param("id"))
		c.JSON(200, gin.H{"ok": true})
	})

	// =====================
	// VIEW STATE
	// =====================

	// GET /api/view-state
	api.GET("/view-state", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		vs, _ := db.GetViewState(user.ID)
		if vs == nil {
			c.JSON(200, gin.H{"zoom": 1.0, "pan_x": 0, "pan_y": 0})
			return
		}
		c.JSON(200, vs)
	})

	// PUT /api/view-state
	api.PUT("/view-state", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		var body struct {
			Zoom *float64 `json:"zoom"`
			PanX *float64 `json:"panX"`
			PanY *float64 `json:"panY"`
		}
		c.ShouldBindJSON(&body)
		zoom := 1.0
		if body.Zoom != nil {
			zoom = *body.Zoom
		}
		panX := 0.0
		if body.PanX != nil {
			panX = *body.PanX
		}
		panY := 0.0
		if body.PanY != nil {
			panY = *body.PanY
		}
		db.SaveViewState(user.ID, zoom, panX, panY)
		c.JSON(200, gin.H{"ok": true})
	})
}

func floatFromQuery(c *gin.Context, key string, fallback float64) float64 {
	v := c.Query(key)
	if v == "" {
		return fallback
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return fallback
	}
	return f
}
