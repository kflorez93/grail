package main

import (
  "fmt"
  "os"
)

func main() {
  if len(os.Args) < 2 {
    fmt.Println("usage: grail-linear me|issues|issue <id>")
    os.Exit(2)
  }
  switch os.Args[1] {
  case "me":
    fmt.Println("{\"me\":true}")
  case "issues":
    fmt.Println("[]")
  case "issue":
    fmt.Println("{\"id\":\"example\"}")
  default:
    fmt.Println("usage: grail-linear me|issues|issue <id>")
    os.Exit(2)
  }
}
