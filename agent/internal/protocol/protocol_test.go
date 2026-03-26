package protocol

import (
	"testing"
)

func TestMessageConstants(t *testing.T) {
	if TerminalAttach != "terminal:attach" {
		t.Errorf("Unexpected TerminalAttach value: %s", TerminalAttach)
	}

	if AgentAuth != "agent:auth" {
		t.Errorf("Unexpected AgentAuth value: %s", AgentAuth)
	}

	if MsgRequest != "request" {
		t.Errorf("Unexpected MsgRequest value: %s", MsgRequest)
	}
}
