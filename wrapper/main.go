package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

type Manifest struct {
    Name        string                   `json:"name"`
    Version     string                   `json:"version"`
    Description string                   `json:"description"`
    Commands    []map[string]any         `json:"commands"`
    Env         map[string]string        `json:"env"`
    Schemas     map[string]map[string]any `json:"schemas"`
    Examples    []string                 `json:"examples"`
}

type Config struct {
    Plugins []string `json:"plugins"`
}

func readJSON(path string, v any) error {
    b, err := os.ReadFile(path)
    if err != nil { return err }
    return json.Unmarshal(b, v)
}

func mergeManifests(base *Manifest, other *Manifest) *Manifest {
    out := *base
    out.Commands = append(out.Commands, other.Commands...)
    if out.Env == nil { out.Env = map[string]string{} }
    for k, v := range other.Env { out.Env[k] = v }
    if out.Schemas == nil { out.Schemas = map[string]map[string]any{} }
    for k, v := range other.Schemas { out.Schemas[k] = v }
    out.Examples = append(out.Examples, other.Examples...)
    return &out
}

func ensureProjectRoot() string {
    root, _ := os.Getwd()
    return root
}

func configPath() string {
    return filepath.Join(ensureProjectRoot(), ".grail", "config.json")
}

func readConfig() (*Config, error) {
    p := configPath()
    b, err := os.ReadFile(p)
    if err != nil { return &Config{Plugins: []string{}}, nil }
    var c Config
    if err := json.Unmarshal(b, &c); err != nil { return nil, err }
    if c.Plugins == nil { c.Plugins = []string{} }
    return &c, nil
}

func writeConfig(c *Config) error {
    dir := filepath.Dir(configPath())
    if err := os.MkdirAll(dir, 0o755); err != nil { return err }
    b, _ := json.MarshalIndent(c, "", "  ")
    return os.WriteFile(configPath(), b, 0o644)
}

func resolvePluginPath(nameOrPath string) (string, error) {
    if strings.HasSuffix(strings.ToLower(nameOrPath), ".json") {
        if filepath.IsAbs(nameOrPath) { return nameOrPath, nil }
        return filepath.Join(ensureProjectRoot(), nameOrPath), nil
    }
    cand := filepath.Join(ensureProjectRoot(), "plugins", nameOrPath+".json")
    return cand, nil
}

func loadAggregatedManifest() (*Manifest, error) {
    var agg Manifest
    // Base project manifest
    if err := readJSON("grail.manifest.json", &agg); err != nil {
        agg = Manifest{}
    }
    if cfg, err := readConfig(); err == nil && len(cfg.Plugins) > 0 {
        for _, entry := range cfg.Plugins {
            p, _ := resolvePluginPath(entry)
            var m Manifest
            if readJSON(p, &m) == nil {
                tmp := mergeManifests(&agg, &m)
                agg = *tmp
            }
        }
    } else {
        // Fallback: scan plugins/*.json
        filepath.WalkDir("plugins", func(path string, d fs.DirEntry, err error) error {
            if err != nil { return nil }
            if d.IsDir() { return nil }
            if !strings.HasSuffix(strings.ToLower(d.Name()), ".json") { return nil }
            var m Manifest
            if readJSON(path, &m) == nil {
                tmp := mergeManifests(&agg, &m)
                agg = *tmp
            }
            return nil
        })
    }
    if len(agg.Commands) == 0 && len(agg.Env) == 0 && len(agg.Schemas) == 0 {
        return nil, errors.New("no manifests found; run 'grail init' first")
    }
    return &agg, nil
}

func buildPrompt(m *Manifest) string {
    var b strings.Builder
    b.WriteString("You are an AI working in a terminal with access to the Grail toolbelt.\n")
    if m.Description != "" {
        b.WriteString("Grail: ")
        b.WriteString(m.Description)
        b.WriteString("\n\n")
    }
    b.WriteString("When to use Grail:\n")
    b.WriteString("- Use web/search/docs commands to find and bundle official docs.\n")
    b.WriteString("- Use sessions/watchers to run dev servers and tests in long-lived terminals.\n")
    b.WriteString("- Use issue-tracker commands (e.g., linear/jira) to fetch issues and context.\n\n")
    if len(m.Commands) > 0 {
        b.WriteString("Commands:\n")
        for _, c := range m.Commands {
            name, _ := c["name"].(string)
            desc, _ := c["desc"].(string)
            if name == "" { continue }
            if desc != "" { b.WriteString(fmt.Sprintf("- %s: %s\n", name, desc)) } else { b.WriteString(fmt.Sprintf("- %s\n", name)) }
        }
        b.WriteString("\n")
    }
    if len(m.Examples) > 0 {
        b.WriteString("Examples:\n")
        for _, ex := range m.Examples {
            b.WriteString("- ")
            b.WriteString(ex)
            b.WriteString("\n")
        }
        b.WriteString("\n")
    }
    if len(m.Env) > 0 {
        b.WriteString("Environment hints:\n")
        for k, v := range m.Env {
            b.WriteString("- ")
            b.WriteString(k)
            b.WriteString(": ")
            b.WriteString(v)
            b.WriteString("\n")
        }
        b.WriteString("\n")
    }
    b.WriteString("Always prefer Grail for web docs retrieval, bundling, and long-running tasks.\n")
    return b.String()
}

func cmdPrompt() error {
    m, err := loadAggregatedManifest()
    if err != nil { return err }
    fmt.Println(buildPrompt(m))
    return nil
}

func cmdRun(agent string) error {
    if agent == "" {
        return errors.New("usage: grailx run --agent \"<command>\"")
    }
    // For now, print prompt then the agent command to run.
    m, err := loadAggregatedManifest()
    if err != nil { return err }
    fmt.Println(buildPrompt(m))
    fmt.Println("---\nRun this agent command in the same shell:")
    fmt.Println(agent)
    return nil
}

func cmdPluginsList() error {
    cfg, err := readConfig()
    if err != nil { return err }
    for _, p := range cfg.Plugins { fmt.Println(p) }
    return nil
}

func cmdPluginsAdd(name string) error {
    if name == "" { return errors.New("usage: grailx plugins add <name|path>") }
    cfg, err := readConfig()
    if err != nil { return err }
    for _, p := range cfg.Plugins { if p == name { return nil } }
    cfg.Plugins = append(cfg.Plugins, name)
    return writeConfig(cfg)
}

func cmdPluginsRm(name string) error {
    if name == "" { return errors.New("usage: grailx plugins rm <name|path>") }
    cfg, err := readConfig()
    if err != nil { return err }
    out := make([]string, 0, len(cfg.Plugins))
    for _, p := range cfg.Plugins { if p != name { out = append(out, p) } }
    cfg.Plugins = out
    return writeConfig(cfg)
}

func main() {
    if len(os.Args) < 2 {
        fmt.Println("usage: grailx prompt | grailx run --agent '<command>' | grailx plugins [list|add|rm]")
        os.Exit(2)
    }
    switch os.Args[1] {
    case "prompt":
        if err := cmdPrompt(); err != nil { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
    case "run":
        fs := flag.NewFlagSet("run", flag.ExitOnError)
        agent := fs.String("agent", "", "Agent command to run")
        _ = fs.Parse(os.Args[2:])
        if err := cmdRun(*agent); err != nil { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
    case "plugins":
        if len(os.Args) < 3 { fmt.Println("usage: grailx plugins [list|add|rm]"); os.Exit(2) }
        sub := os.Args[2]
        switch sub {
        case "list":
            if err := cmdPluginsList(); err != nil { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
        case "add":
            name := ""
            if len(os.Args) > 3 { name = os.Args[3] }
            if err := cmdPluginsAdd(name); err != nil { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
        case "rm":
            name := ""
            if len(os.Args) > 3 { name = os.Args[3] }
            if err := cmdPluginsRm(name); err != nil { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
        default:
            fmt.Println("usage: grailx plugins [list|add|rm]")
            os.Exit(2)
        }
    default:
        fmt.Println("usage: grailx prompt | grailx run --agent '<command>' | grailx plugins [list|add|rm]")
        os.Exit(2)
    }
}


