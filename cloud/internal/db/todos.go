package db

import (
	"database/sql"
	"time"
)

type TodoGroup struct {
	ID        string     `json:"id"`
	UserID    string     `json:"user_id"`
	Name      string     `json:"name"`
	SortOrder int        `json:"sort_order"`
	CreatedAt string     `json:"created_at"`
	Items     []TodoItem `json:"items"`
}

type TodoItem struct {
	ID          string  `json:"id"`
	GroupID     string  `json:"group_id"`
	UserID      string  `json:"user_id"`
	Title       string  `json:"title"`
	Notes       string  `json:"notes"`
	SortOrder   int     `json:"sort_order"`
	CompletedAt *string `json:"completed_at"`
	CreatedAt   string  `json:"created_at"`
}

// GetTodoGroups returns all groups with their items for a user, ordered by sort_order.
func GetTodoGroups(userID string) ([]TodoGroup, error) {
	groupRows, err := db.Query(
		`SELECT id, user_id, name, sort_order, created_at
		 FROM todo_groups WHERE user_id=? ORDER BY sort_order ASC, created_at ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer groupRows.Close()

	var groups []TodoGroup
	for groupRows.Next() {
		var g TodoGroup
		if err := groupRows.Scan(&g.ID, &g.UserID, &g.Name, &g.SortOrder, &g.CreatedAt); err != nil {
			return nil, err
		}
		items, err := getTodoItemsByGroup(g.ID)
		if err != nil {
			return nil, err
		}
		g.Items = items
		groups = append(groups, g)
	}
	if groups == nil {
		groups = []TodoGroup{}
	}
	return groups, nil
}

func getTodoItemsByGroup(groupID string) ([]TodoItem, error) {
	rows, err := db.Query(
		`SELECT id, group_id, user_id, title, notes, sort_order, completed_at, created_at
		 FROM todo_items WHERE group_id=? ORDER BY sort_order ASC, created_at ASC`, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []TodoItem
	for rows.Next() {
		var item TodoItem
		var completedAt sql.NullString
		if err := rows.Scan(&item.ID, &item.GroupID, &item.UserID, &item.Title, &item.Notes,
			&item.SortOrder, &completedAt, &item.CreatedAt); err != nil {
			return nil, err
		}
		if completedAt.Valid {
			item.CompletedAt = &completedAt.String
		}
		items = append(items, item)
	}
	if items == nil {
		items = []TodoItem{}
	}
	return items, nil
}

// CreateTodoGroup creates a new todo group.
func CreateTodoGroup(userID, name string, sortOrder int) (*TodoGroup, error) {
	id := newUUID()
	_, err := db.Exec(`INSERT INTO todo_groups (id, user_id, name, sort_order)
		VALUES (?, ?, ?, ?)`, id, userID, name, sortOrder)
	if err != nil {
		return nil, err
	}
	return &TodoGroup{
		ID: id, UserID: userID, Name: name, SortOrder: sortOrder, Items: []TodoItem{},
	}, nil
}

// UpdateTodoGroup updates a group's name and/or sort_order.
func UpdateTodoGroup(groupID, userID string, name *string, sortOrder *int) error {
	if name != nil && sortOrder != nil {
		_, err := db.Exec(`UPDATE todo_groups SET name=?, sort_order=? WHERE id=? AND user_id=?`,
			*name, *sortOrder, groupID, userID)
		return err
	}
	if name != nil {
		_, err := db.Exec(`UPDATE todo_groups SET name=? WHERE id=? AND user_id=?`,
			*name, groupID, userID)
		return err
	}
	if sortOrder != nil {
		_, err := db.Exec(`UPDATE todo_groups SET sort_order=? WHERE id=? AND user_id=?`,
			*sortOrder, groupID, userID)
		return err
	}
	return nil
}

// DeleteTodoGroup deletes a group and all its items (via CASCADE).
func DeleteTodoGroup(groupID, userID string) error {
	_, err := db.Exec(`DELETE FROM todo_groups WHERE id=? AND user_id=?`, groupID, userID)
	return err
}

// CreateTodoItem creates a new todo item in a group.
func CreateTodoItem(userID, groupID, title string, sortOrder int) (*TodoItem, error) {
	id := newUUID()
	_, err := db.Exec(`INSERT INTO todo_items (id, group_id, user_id, title, sort_order)
		VALUES (?, ?, ?, ?, ?)`, id, groupID, userID, title, sortOrder)
	if err != nil {
		return nil, err
	}
	return &TodoItem{
		ID: id, GroupID: groupID, UserID: userID, Title: title, Notes: "", SortOrder: sortOrder,
		CreatedAt: time.Now().UTC().Format("2006-01-02T15:04:05"),
	}, nil
}

// UpdateTodoItem updates an item's title, notes, and/or sort_order.
func UpdateTodoItem(itemID, userID string, title *string, notes *string, sortOrder *int) error {
	// Build dynamically to avoid unnecessary updates
	args := []interface{}{}
	sets := []string{}

	if title != nil {
		sets = append(sets, "title=?")
		args = append(args, *title)
	}
	if notes != nil {
		sets = append(sets, "notes=?")
		args = append(args, *notes)
	}
	if sortOrder != nil {
		sets = append(sets, "sort_order=?")
		args = append(args, *sortOrder)
	}
	if len(sets) == 0 {
		return nil
	}
	args = append(args, itemID, userID)
	query := "UPDATE todo_items SET " + joinSets(sets) + " WHERE id=? AND user_id=?"
	_, err := db.Exec(query, args...)
	return err
}

// ToggleTodoItem sets or clears completed_at based on the completed flag.
func ToggleTodoItem(itemID, userID string, completed bool) error {
	if completed {
		_, err := db.Exec(`UPDATE todo_items SET completed_at=strftime('%Y-%m-%dT%H:%M:%S', 'now') WHERE id=? AND user_id=?`,
			itemID, userID)
		return err
	}
	_, err := db.Exec(`UPDATE todo_items SET completed_at=NULL WHERE id=? AND user_id=?`,
		itemID, userID)
	return err
}

// DeleteTodoItem deletes a single todo item.
func DeleteTodoItem(itemID, userID string) error {
	_, err := db.Exec(`DELETE FROM todo_items WHERE id=? AND user_id=?`, itemID, userID)
	return err
}

func joinSets(sets []string) string {
	result := ""
	for i, s := range sets {
		if i > 0 {
			result += ", "
		}
		result += s
	}
	return result
}
