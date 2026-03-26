package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"cloud/internal/config"
)

type UserClaims struct {
	Sub      string `json:"sub"`
	Username string `json:"username,omitempty"`
	Tier     string `json:"tier,omitempty"`
	Type     string `json:"type,omitempty"`
	jwt.RegisteredClaims
}

func IssueAccessToken(userID, username, tier string) (string, error) {
	cfg := config.Get()
	ttl, err := time.ParseDuration(cfg.JWT.UserTTL)
	if err != nil {
		ttl = time.Hour
	}
	claims := UserClaims{
		Sub:      userID,
		Username: username,
		Tier:     tier,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)),
			ID:        uuid.New().String(),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.JWT.Secret))
}

func IssueRefreshToken(userID string) (string, error) {
	cfg := config.Get()
	ttl, err := time.ParseDuration(cfg.JWT.RefreshTTL)
	if err != nil {
		ttl = 7 * 24 * time.Hour
	}
	claims := UserClaims{
		Sub:  userID,
		Type: "refresh",
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)),
			ID:        uuid.New().String(),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.JWT.Secret))
}

func VerifyToken(tokenString string) (*UserClaims, error) {
	cfg := config.Get()
	token, err := jwt.ParseWithClaims(tokenString, &UserClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(cfg.JWT.Secret), nil
	})
	if err != nil {
		return nil, err
	}
	if claims, ok := token.Claims.(*UserClaims); ok && token.Valid {
		return claims, nil
	}
	return nil, fmt.Errorf("invalid token")
}
