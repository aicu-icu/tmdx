package metrics

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
)

// Metrics represents system metrics
type Metrics struct {
	RAM *RAMMetrics `json:"ram"`
	CPU int         `json:"cpu"` // percentage
	GPU *GPUMetrics `json:"gpu,omitempty"`
}

// RAMMetrics represents memory usage
type RAMMetrics struct {
	Total     uint64 `json:"total"`
	Used      uint64 `json:"used"`
	Available uint64 `json:"available"`
}

// GPUMetrics represents GPU usage
type GPUMetrics struct {
	Utilization int    `json:"utilization"`
	MemUsed     uint64 `json:"memUsed"`
	MemTotal    uint64 `json:"memTotal"`
}

var (
	prevIdle  uint64
	prevTotal uint64
	mu        sync.Mutex
)

// GetLocalMetrics gets local system metrics
func GetLocalMetrics() (*Metrics, error) {
	ram, err := getRAMMetrics()
	if err != nil {
		return nil, fmt.Errorf("failed to get RAM metrics: %w", err)
	}

	cpu, err := getCPUMetrics()
	if err != nil {
		// Fallback to load average
		cpu = getCPULoadAverage()
	}

	gpu, _ := getGPUMetrics()

	return &Metrics{
		RAM: ram,
		CPU: cpu,
		GPU: gpu,
	}, nil
}

func getRAMMetrics() (*RAMMetrics, error) {
	switch runtime.GOOS {
	case "linux":
		return getLinuxRAM()
	case "darwin":
		return getMacRAM()
	default:
		return getGenericRAM()
	}
}

func getLinuxRAM() (*RAMMetrics, error) {
	file, err := os.Open("/proc/meminfo")
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var total, available uint64
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "MemTotal:") {
			total = parseMemLine(line)
		} else if strings.HasPrefix(line, "MemAvailable:") {
			available = parseMemLine(line)
		}
	}

	if total == 0 {
		return nil, fmt.Errorf("failed to parse meminfo")
	}

	return &RAMMetrics{
		Total:     total * 1024, // Convert kB to bytes
		Used:      (total - available) * 1024,
		Available: available * 1024,
	}, nil
}

func parseMemLine(line string) uint64 {
	fields := strings.Fields(line)
	if len(fields) < 2 {
		return 0
	}
	val, _ := strconv.ParseUint(fields[1], 10, 64)
	return val
}

func getMacRAM() (*RAMMetrics, error) {
	cmd := exec.Command("sysctl", "-n", "hw.memsize")
	output, err := cmd.Output()
	if err != nil {
		return nil, err
	}

	total, err := strconv.ParseUint(strings.TrimSpace(string(output)), 10, 64)
	if err != nil {
		return nil, err
	}

	// Get page size and free pages
	cmd = exec.Command("vm_stat")
	output, err = cmd.Output()
	if err != nil {
		return nil, err
	}

	var freePages uint64
	scanner := bufio.NewScanner(strings.NewReader(string(output)))
	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, "Pages free:") {
			fields := strings.Fields(line)
			if len(fields) >= 3 {
				freeStr := strings.TrimSuffix(fields[2], ".")
				freePages, _ = strconv.ParseUint(freeStr, 10, 64)
			}
		}
	}

	pageSize := uint64(4096) // Default page size
	available := freePages * pageSize

	return &RAMMetrics{
		Total:     total,
		Used:      total - available,
		Available: available,
	}, nil
}

func getGenericRAM() (*RAMMetrics, error) {
	// Fallback - return zeros
	return &RAMMetrics{
		Total:     0,
		Used:      0,
		Available: 0,
	}, nil
}

func getCPUMetrics() (int, error) {
	if runtime.GOOS != "linux" {
		return getCPULoadAverage(), nil
	}

	file, err := os.Open("/proc/stat")
	if err != nil {
		return 0, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	if !scanner.Scan() {
		return 0, fmt.Errorf("failed to read /proc/stat")
	}

	line := scanner.Text()
	fields := strings.Fields(line)
	if len(fields) < 5 || fields[0] != "cpu" {
		return 0, fmt.Errorf("invalid /proc/stat format")
	}

	var total uint64
	for _, f := range fields[1:] {
		val, err := strconv.ParseUint(f, 10, 64)
		if err != nil {
			continue
		}
		total += val
	}

	idle, _ := strconv.ParseUint(fields[4], 10, 64)

	mu.Lock()
	defer mu.Unlock()

	// Calculate delta
	if prevTotal == 0 {
		prevIdle = idle
		prevTotal = total
		return 0, nil
	}

	dIdle := idle - prevIdle
	dTotal := total - prevTotal

	prevIdle = idle
	prevTotal = total

	if dTotal == 0 {
		return 0, nil
	}

	cpu := int((1 - float64(dIdle)/float64(dTotal)) * 100)
	return cpu, nil
}

func getCPULoadAverage() int {
	if runtime.GOOS == "windows" {
		return 0
	}

	cmd := exec.Command("sysctl", "-n", "vm.loadavg")
	if runtime.GOOS == "linux" {
		cmd = exec.Command("cat", "/proc/loadavg")
	}

	output, err := cmd.Output()
	if err != nil {
		return 0
	}

	fields := strings.Fields(string(output))
	if len(fields) < 1 {
		return 0
	}

	loadStr := fields[0]
	if runtime.GOOS == "darwin" {
		// macOS output format: { 1.23 4.56 7.89 }
		loadStr = strings.Trim(fields[0], "{")
	}

	load, err := strconv.ParseFloat(loadStr, 64)
	if err != nil {
		return 0
	}

	cpuCount := runtime.NumCPU()
	return int((load / float64(cpuCount)) * 100)
}

func getGPUMetrics() (*GPUMetrics, error) {
	cmd := exec.Command("nvidia-smi",
		"--query-gpu=utilization.gpu,memory.used,memory.total",
		"--format=csv,noheader,nounits")

	output, err := cmd.Output()
	if err != nil {
		return nil, err // No NVIDIA GPU or nvidia-smi not available
	}

	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	if len(lines) == 0 {
		return nil, fmt.Errorf("no GPU data")
	}

	parts := strings.Split(lines[0], ",")
	if len(parts) < 3 {
		return nil, fmt.Errorf("invalid GPU data format")
	}

	utilization, _ := strconv.Atoi(strings.TrimSpace(parts[0]))
	memUsed, _ := strconv.ParseUint(strings.TrimSpace(parts[1]), 10, 64)
	memTotal, _ := strconv.ParseUint(strings.TrimSpace(parts[2]), 10, 64)

	return &GPUMetrics{
		Utilization: utilization,
		MemUsed:     memUsed * 1024 * 1024, // MiB to bytes
		MemTotal:    memTotal * 1024 * 1024,
	}, nil
}
