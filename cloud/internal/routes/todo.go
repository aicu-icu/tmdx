package routes

import (
	"github.com/gin-gonic/gin"

	"cloud/internal/auth"
	"cloud/internal/db"
)

func SetupTodoRoutes(r *gin.Engine) {
	api := r.Group("/api")

	// GET /api/todos — all groups with their items
	api.GET("/todos", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		groups, err := db.GetTodoGroups(user.ID)
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to load todos"})
			return
		}
		c.JSON(200, gin.H{"groups": groups})
	})

	// POST /api/todos/groups — create group
	api.POST("/todos/groups", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		var body struct {
			Name      string `json:"name" binding:"required"`
			SortOrder int    `json:"sortOrder"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "name is required"})
			return
		}
		group, err := db.CreateTodoGroup(user.ID, body.Name, body.SortOrder)
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to create group"})
			return
		}
		c.JSON(200, group)
	})

	// PATCH /api/todos/groups/:id — update group
	api.PATCH("/todos/groups/:id", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		var body struct {
			Name      *string `json:"name"`
			SortOrder *int    `json:"sortOrder"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Invalid body"})
			return
		}
		if err := db.UpdateTodoGroup(c.Param("id"), user.ID, body.Name, body.SortOrder); err != nil {
			c.JSON(500, gin.H{"error": "Failed to update group"})
			return
		}
		c.JSON(200, gin.H{"ok": true})
	})

	// DELETE /api/todos/groups/:id — delete group and its items
	api.DELETE("/todos/groups/:id", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		db.DeleteTodoGroup(c.Param("id"), user.ID)
		c.JSON(200, gin.H{"ok": true})
	})

	// POST /api/todos/groups/:groupId/items — create item
	api.POST("/todos/groups/:groupId/items", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		var body struct {
			Title     string `json:"title" binding:"required"`
			SortOrder int    `json:"sortOrder"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "title is required"})
			return
		}
		item, err := db.CreateTodoItem(user.ID, c.Param("groupId"), body.Title, body.SortOrder)
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to create item"})
			return
		}
		c.JSON(200, item)
	})

	// PATCH /api/todos/items/:id — update item title/notes/sortOrder
	api.PATCH("/todos/items/:id", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		var body struct {
			Title     *string `json:"title"`
			Notes     *string `json:"notes"`
			SortOrder *int    `json:"sortOrder"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Invalid body"})
			return
		}
		if err := db.UpdateTodoItem(c.Param("id"), user.ID, body.Title, body.Notes, body.SortOrder); err != nil {
			c.JSON(500, gin.H{"error": "Failed to update item"})
			return
		}
		c.JSON(200, gin.H{"ok": true})
	})

	// PATCH /api/todos/items/:id/toggle — toggle completed
	api.PATCH("/todos/items/:id/toggle", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		var body struct {
			Completed bool `json:"completed"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Invalid body"})
			return
		}
		if err := db.ToggleTodoItem(c.Param("id"), user.ID, body.Completed); err != nil {
			c.JSON(500, gin.H{"error": "Failed to toggle item"})
			return
		}
		c.JSON(200, gin.H{"ok": true})
	})

	// DELETE /api/todos/items/:id — delete item
	api.DELETE("/todos/items/:id", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		db.DeleteTodoItem(c.Param("id"), user.ID)
		c.JSON(200, gin.H{"ok": true})
	})
}
