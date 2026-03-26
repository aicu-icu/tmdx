package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"cloud/internal/config"
)

type AgentClaims struct {
	Sub      string `json:"sub"`
	UserID   string `json:"userId"`
	Hostname string `json:"hostname"`
	Type     string `json:"type"`
	jwt.RegisteredClaims
}

// VerifyAgentToken verifies an agent JWT token.
func VerifyAgentToken(tokenStr string) (agentID, userID string, err error) {
	cfg := config.Get()

	token, err := jwt.ParseWithClaims(tokenStr, &AgentClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(cfg.JWT.AgentSecret), nil
	})
	if err != nil {
		return "", "", err
	}

	claims, ok := token.Claims.(*AgentClaims)
	if !ok || !token.Valid {
		return "", "", fmt.Errorf("invalid token")
	}
	if claims.Type != "agent" {
		return "", "", fmt.Errorf("invalid token type")
	}

	return claims.Sub, claims.UserID, nil
}

// GenerateAgentToken generates a long-lived JWT for an agent.
func GenerateAgentToken(userID, agentID, hostname string) (string, error) {
	cfg := config.Get()
	claims := AgentClaims{
		Sub:      agentID,
		UserID:   userID,
		Hostname: hostname,
		Type:     "agent",
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(365 * 24 * time.Hour)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.JWT.AgentSecret))
}
