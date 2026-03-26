package protocol

// Message type constants shared between agent and cloud relay
const (
	// Terminal I/O
	TerminalAttach   = "terminal:attach"
	TerminalAttached = "terminal:attached"
	TerminalHistory  = "terminal:history"
	TerminalInput    = "terminal:input"
	TerminalOutput   = "terminal:output"
	TerminalResize   = "terminal:resize"
	TerminalScroll   = "terminal:scroll"
	TerminalClose    = "terminal:close"
	TerminalClosed   = "terminal:closed"
	TerminalDetach   = "terminal:detach"
	TerminalDetached = "terminal:detached"
	TerminalError    = "terminal:error"
	TerminalResume   = "terminal:resume"
	TerminalResumed  = "terminal:resumed"

	// Metrics
	Metrics = "metrics"

	// REST-over-WS
	MsgRequest     = "request"
	MsgResponse    = "response"
	MsgScanPartial = "scan:partial"

	// Agent <-> Cloud
	AgentAuth     = "agent:auth"
	AgentAuthOK   = "agent:auth:ok"
	AgentAuthFail = "agent:auth:fail"
	AgentPing     = "agent:ping"
	AgentPong     = "agent:pong"

	// Agent updates
	UpdateAvailable = "update:available"
	UpdateInstall   = "update:install"
	UpdateProgress  = "update:progress"
)

// Message represents a WebSocket message
type Message struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload,omitempty"`
	ID      string      `json:"id,omitempty"`
}

// Request represents a REST-over-WS request
type Request struct {
	Method string      `json:"method"`
	Path   string      `json:"path"`
	Body   interface{} `json:"body,omitempty"`
}

// Response represents a REST-over-WS response
type Response struct {
	Status int         `json:"status"`
	Body   interface{} `json:"body"`
}
