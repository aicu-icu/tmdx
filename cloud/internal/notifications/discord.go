package notifications

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"cloud/internal/config"
)

type discordEmbed struct {
	Title     string            `json:"title"`
	Color     int               `json:"color"`
	Thumbnail *discordThumbnail `json:"thumbnail,omitempty"`
	Fields    []discordField    `json:"fields"`
	Timestamp string            `json:"timestamp"`
	Footer    discordFooter     `json:"footer"`
}

type discordThumbnail struct {
	URL string `json:"url"`
}

type discordField struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Inline bool   `json:"inline"`
}

type discordFooter struct {
	Text string `json:"text"`
}

type discordWebhook struct {
	Embeds []discordEmbed `json:"embeds"`
}

func NotifyNewUser(userID, username string) {
	cfg := config.Get()
	if cfg.Discord.WebhookURL == "" {
		return
	}

	embed := discordEmbed{
		Title: "New User Signup",
		Color: 0x6366f1,
		Fields: []discordField{
			{Name: "Username", Value: username, Inline: true},
			{Name: "User ID", Value: fmt.Sprintf("`%s`", userID), Inline: true},
		},
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Footer:    discordFooter{Text: "tmdx"},
	}

	sendWebhook(cfg.Discord.WebhookURL, discordWebhook{Embeds: []discordEmbed{embed}})
}

func sendWebhook(url string, payload discordWebhook) {
	body, err := json.Marshal(payload)
	if err != nil {
		return
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		fmt.Printf("[discord] Webhook error: %v\n", err)
		return
	}
	resp.Body.Close()
	if resp.StatusCode >= 300 {
		fmt.Printf("[discord] Webhook failed: %d %s\n", resp.StatusCode, resp.Status)
	}
}
