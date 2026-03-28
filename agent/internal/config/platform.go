package config

import "runtime"

// PlatformSuffix is the platform identifier used for GitHub release asset names.
// Injected via -ldflags for linux/arm builds (e.g., "linux-armv6", "linux-arm").
// If empty, inferred from runtime.GOOS and runtime.GOARCH.
var PlatformSuffix = ""

// GetPlatformSuffix returns the platform suffix for release asset lookup.
func GetPlatformSuffix() string {
	if PlatformSuffix != "" {
		return PlatformSuffix
	}
	return runtime.GOOS + "-" + runtime.GOARCH
}
