package update

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

const (
	GitHubOwner = "aicu-icu"
	GitHubRepo  = "tmdx"
)

// ReleaseInfo holds the parsed latest release data
type ReleaseInfo struct {
	Version     string
	DownloadURL string
	HasAsset    bool
	Size        int64
}

// CheckLatest fetches the latest GitHub release and returns info for the given platform suffix.
func CheckLatest(platformSuffix string) (*ReleaseInfo, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest", GitHubOwner, GitHubRepo)
	client := &http.Client{}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to check GitHub releases: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var release struct {
		TagName string `json:"tag_name"`
		Assets  []struct {
			Name               string `json:"name"`
			BrowserDownloadURL string `json:"browser_download_url"`
			Size               int64  `json:"size"`
		} `json:"assets"`
	}
	if err := json.Unmarshal(body, &release); err != nil {
		return nil, fmt.Errorf("failed to parse release JSON: %w", err)
	}

	info := &ReleaseInfo{
		Version: strings.TrimPrefix(release.TagName, "v"),
	}

	targetName := "tmd-agent-" + platformSuffix
	for _, a := range release.Assets {
		if a.Name == targetName {
			info.DownloadURL = a.BrowserDownloadURL
			info.HasAsset = true
			info.Size = a.Size
			break
		}
	}

	return info, nil
}

// progressReader wraps an io.Reader and reports download progress.
type progressReader struct {
	reader     io.Reader
	downloaded int64
	total      int64
	onProgress func(downloaded, total int64)
}

func (pr *progressReader) Read(p []byte) (int, error) {
	n, err := pr.reader.Read(p)
	pr.downloaded += int64(n)
	if pr.onProgress != nil {
		pr.onProgress(pr.downloaded, pr.total)
	}
	return n, err
}

// DownloadAndReplace downloads the binary from downloadURL to a temp file,
// then atomically replaces the current running binary.
// onProgress is called with (downloaded, total) bytes during download. May be nil.
func DownloadAndReplace(downloadURL string, onProgress func(downloaded, total int64)) error {
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get executable path: %w", err)
	}

	// Download to temp file
	tmpFile, err := os.CreateTemp("", "tmd-agent-update-*")
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	tmpPath := tmpFile.Name()
	defer os.Remove(tmpPath)

	resp, err := http.Get(downloadURL)
	if err != nil {
		tmpFile.Close()
		return fmt.Errorf("failed to download: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		tmpFile.Close()
		return fmt.Errorf("download returned status %d", resp.StatusCode)
	}

	totalSize := resp.ContentLength
	var reader io.Reader = resp.Body
	if onProgress != nil {
		reader = &progressReader{reader: resp.Body, total: totalSize, onProgress: onProgress}
	}

	if _, err := io.Copy(tmpFile, reader); err != nil {
		tmpFile.Close()
		return fmt.Errorf("failed to write download: %w", err)
	}
	tmpFile.Close()

	if err := os.Chmod(tmpPath, 0755); err != nil {
		return fmt.Errorf("failed to set permissions: %w", err)
	}

	if err := os.Rename(tmpPath, exePath); err != nil {
		return fmt.Errorf("failed to replace binary: %w", err)
	}

	return nil
}

// IsVersionOutdated returns true if current < latest (dot-separated numeric comparison).
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
			fmt.Sscanf(c[i], "%d", &cv)
		}
		if i < len(l) {
			fmt.Sscanf(l[i], "%d", &lv)
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
