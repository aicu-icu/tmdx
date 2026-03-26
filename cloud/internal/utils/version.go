package utils

import (
	"strconv"
	"strings"
)

// IsVersionOutdated returns true if current < latest (simple semver comparison).
func IsVersionOutdated(current, latest string) bool {
	if current == "" || latest == "" {
		return false
	}
	c := strings.Split(current, ".")
	l := strings.Split(latest, ".")
	maxLen := len(c)
	if len(l) > maxLen {
		maxLen = len(l)
	}
	for i := 0; i < maxLen; i++ {
		cv := 0
		lv := 0
		if i < len(c) {
			cv, _ = strconv.Atoi(c[i])
		}
		if i < len(l) {
			lv, _ = strconv.Atoi(l[i])
		}
		if cv < lv {
			return true
		}
		if cv > lv {
			return false
		}
	}
	return false
}
