package main

import (
	"os"
	"strings"
	"testing"
)

func TestBuildNameComesFromCIOrTheCheckout(t *testing.T) {
	defer func(c, d string) { buildCommit, buildDate = c, d }(buildCommit, buildDate)
	buildCommit, buildDate = "3d350aa1b2c3d4e5f6", "2026-10-09"
	if got := buildName(); got != "3d350aa (2026-10-09)" {
		t.Fatalf("with CI's flags: %q", got)
	}
	buildCommit, buildDate = "", ""
	// A test binary records no commit, so this is the fallback.
	if got := buildName(); got == "" {
		t.Fatal("without flags, the build has no name")
	}
}

// Adding or upgrading a module without regenerating the notices fails here.
func TestTheNoticesNameEveryModuleInGoMod(t *testing.T) {
	mod, err := os.ReadFile("go.mod")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(relayNotices, "== Go standard library ==") {
		t.Error("the notices don't include Go's standard library")
	}
	for _, line := range strings.Split(string(mod), "\n") {
		fields := strings.Fields(strings.TrimPrefix(strings.TrimSpace(line), "require "))
		if len(fields) < 2 || !strings.Contains(fields[0], ".") || !strings.HasPrefix(fields[1], "v") || strings.HasPrefix(fields[0], "//") {
			continue
		}
		if !strings.Contains(relayNotices, "== "+fields[0]+" "+fields[1]+" ==") {
			t.Errorf("the notices don't include %s %s: run npm run notices:relay", fields[0], fields[1])
		}
	}
}

func TestLicensesIncludeTheAppsOwnNotices(t *testing.T) {
	page := []byte("<html><body><script>app()</script>\n" + appNoticesStart + "\n== yjs 13.6.33 (MIT) ==\n\nThe MIT License</script>\n</body></html>")
	got := licenses(page)
	if !strings.HasPrefix(got, "The Planning Board relay is licensed") || !strings.Contains(got, "== yjs 13.6.33 (MIT) ==") || strings.Contains(got, "app()") {
		t.Fatalf("licenses:\n%s", got)
	}
	if got := licenses([]byte("<p>This relay was built without the app.</p>")); !strings.Contains(got, "built without the app") {
		t.Fatalf("without the app:\n%s", got)
	}
}
