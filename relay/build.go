package main

import (
	"bytes"
	_ "embed"
	"runtime/debug"
	"strings"
)

// Which build this relay is, so whoever runs it can tell, and a report about
// sharing can say (docs/hosting.md). CI sets both:
//
//	go build -ldflags "-X main.buildCommit=$(git rev-parse HEAD) -X main.buildDate=$(git log -1 --format=%cs)"
var buildCommit, buildDate string

// buildName is this relay's build, such as "3d350aa (2026-10-09)": from CI's
// flags, else from the commit Go records when built in a checkout, else "dev".
func buildName() string {
	commit, date := buildCommit, buildDate
	if commit == "" {
		if info, ok := debug.ReadBuildInfo(); ok {
			for _, s := range info.Settings {
				switch s.Key {
				case "vcs.revision":
					commit = s.Value
				case "vcs.time":
					date, _, _ = strings.Cut(s.Value, "T")
				}
			}
		}
	}
	if commit == "" {
		return "dev"
	}
	if len(commit) > 7 {
		commit = commit[:7]
	}
	if date == "" {
		return commit
	}
	return commit + " (" + date + ")"
}

// relayNotices are the licenses of what's built into the program: Go's
// standard library and the modules it uses. `npm run notices:relay`
// regenerates the file, and a test checks it names every module in go.mod.
//
//go:embed third_party_notices.txt
var relayNotices string

// appNoticesStart is how the built app holds its own notices (scripts/notices.ts).
const appNoticesStart = `<script type="text/plain" id="third-party-notices">`

// licenses is everything -licenses prints: the relay's notices, then those of
// the app it serves, which its build put inside the page.
func licenses(app []byte) string {
	var b strings.Builder
	b.WriteString(strings.TrimSpace(relayNotices))
	b.WriteString("\n\n\nThe app this relay serves:\n\n")
	_, after, found := bytes.Cut(app, []byte(appNoticesStart))
	notices, _, closed := bytes.Cut(after, []byte("</script>"))
	if found && closed {
		b.Write(bytes.TrimSpace(notices))
	} else {
		b.WriteString("This relay was built without the app, so it includes none of the app's software.")
	}
	b.WriteString("\n")
	return b.String()
}
