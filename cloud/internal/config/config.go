package config

import (
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type JWTConfig struct {
	Secret      string
	AgentSecret string
	UserTTL     string // e.g. "1h"
	RefreshTTL  string // e.g. "168h" (7d)
}

type DiscordConfig struct {
	WebhookURL string
}

type Config struct {
	Port         int
	Host         string
	DBPath       string
	JWT          JWTConfig
	CloudHost    string
	AppHost      string
	LandingDir   string
	Discord      DiscordConfig
	AdminUserID  string
	NodeEnv      string
	IsProduction bool
}

var cfg *Config

func Load() *Config {
	_ = godotenv.Load()

	nodeEnv := getEnv("NODE_ENV", "development")
	isProduction := nodeEnv == "production"

	jwtSecret := getEnv("JWT_SECRET", "dev-secret-change-in-production")
	agentSecret := getEnv("AGENT_JWT_SECRET", "dev-agent-secret-change-in-production")

	if isProduction {
		if jwtSecret == "dev-secret-change-in-production" {
			panic("FATAL: JWT_SECRET must be set in production")
		}
		if agentSecret == "dev-agent-secret-change-in-production" {
			panic("FATAL: AGENT_JWT_SECRET must be set in production")
		}
	}

	port, _ := strconv.Atoi(getEnv("PORT", "1071"))

	cfg = &Config{
		Port:   port,
		Host:   getEnv("HOST", "0.0.0.0"),
		DBPath: getEnv("DATABASE_PATH", "./data/tc.db"),
		JWT: JWTConfig{
			Secret:      jwtSecret,
			AgentSecret: agentSecret,
			UserTTL:     getEnv("JWT_USER_TTL", "1h"),
			RefreshTTL:  getEnv("JWT_REFRESH_TTL", "168h"),
		},
		CloudHost:    getEnv("CLOUD_HOST", "localhost:1071"),
		AppHost:      getEnv("APP_HOST", ""),
		LandingDir:   getEnv("LANDING_DIR", ""),
		Discord:      DiscordConfig{WebhookURL: getEnv("DISCORD_WEBHOOK_URL", "")},
		AdminUserID:  getEnv("ADMIN_USER_ID", ""),
		NodeEnv:      nodeEnv,
		IsProduction: isProduction,
	}

	return cfg
}

func Get() *Config {
	if cfg == nil {
		return Load()
	}
	return cfg
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
