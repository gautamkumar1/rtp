package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/rtp-platform/simulator/internal/schema"
)

func newTestServer() *httptest.Server {
	s := New(":0")
	return httptest.NewServer(s.srv.Handler)
}

func TestHealth(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()
	r, err := http.Get(ts.URL + "/health")
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	if r.StatusCode != 200 {
		t.Fatalf("status=%d", r.StatusCode)
	}
	var body map[string]string
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["status"] != "ok" {
		t.Fatalf("body=%v", body)
	}
}

func TestSimulate_InvalidJSON(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()
	r, err := http.Post(ts.URL+"/simulate", "application/json", strings.NewReader("not json"))
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	if r.StatusCode != 400 {
		t.Fatalf("expected 400, got %d", r.StatusCode)
	}
}

func TestSimulate_InvalidSchema(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()
	req := schema.SimulateRequest{
		Schema: schema.GameSchema{}, // empty — fails validation
		Config: schema.SimulationConfig{SpinCount: 1_000_000},
	}
	b, _ := json.Marshal(req)
	r, err := http.Post(ts.URL+"/simulate", "application/json", bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	if r.StatusCode != 400 {
		t.Fatalf("expected 400, got %d", r.StatusCode)
	}
}

func TestSimulate_HappyPath(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()

	req := schema.SimulateRequest{
		Schema: schema.GameSchema{
			SchemaVersion: "0.1.0",
			GameID:        "t",
			GameName:      "t",
			Bet:           schema.BetConfig{DefaultBet: 1, Lines: 1, CoinValue: 1},
			Reels: [][]string{
				{"A", "B"}, {"A", "B"}, {"A", "B"},
			},
			Paylines: [][]int{{0, 0, 0}},
			Symbols: []schema.Symbol{
				{ID: "A", Name: "A"},
				{ID: "B", Name: "B"},
			},
			Paytable: map[string]map[string]float64{
				"A": {"3": 8},
				"B": {"3": 0},
			},
		},
		Config: schema.SimulationConfig{SpinCount: 1_000_000, Rows: 1, Seed: 7},
	}
	body, _ := json.Marshal(req)
	r, err := http.Post(ts.URL+"/simulate", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	if r.StatusCode != 200 {
		t.Fatalf("status=%d", r.StatusCode)
	}
	var out map[string]any
	if err := json.NewDecoder(r.Body).Decode(&out); err != nil {
		t.Fatal(err)
	}
	if _, ok := out["rtp"]; !ok {
		t.Fatal("missing rtp field")
	}
	if _, ok := out["symbolHitProbabilities"]; !ok {
		t.Fatal("missing symbolHitProbabilities field")
	}
}

func TestSimulate_IgnoresExtraSchemaFields(t *testing.T) {
	ts := newTestServer()
	defer ts.Close()
	// Send a schema with extra TS-only fields (sourceEvidence, assumptions).
	// Decoder must accept them silently.
	body := `{
	  "schema": {
	    "schemaVersion": "0.1.0",
	    "provider": "x",
	    "gameId": "t",
	    "gameName": "t",
	    "gameType": "video-slot",
	    "bet": {"defaultBet":1,"lines":1,"coinValue":1},
	    "reels": [["A","B"],["A","B"],["A","B"]],
	    "paylines": [[0,0,0]],
	    "symbols": [{"id":"A","name":"A"},{"id":"B","name":"B"}],
	    "paytable": {"A":{"3":8},"B":{"3":0}},
	    "sourceEvidence": [],
	    "assumptions": [],
	    "warnings": []
	  },
	  "config": {"spinCount": 1000000, "rows": 1, "seed": 1}
	}`
	r, err := http.Post(ts.URL+"/simulate", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	if r.StatusCode != 200 {
		t.Fatalf("status=%d", r.StatusCode)
	}
}
