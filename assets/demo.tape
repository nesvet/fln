Output assets/demo.gif

Require fln

Set Shell "zsh"
Set Theme "Catppuccin Mocha"
Set FontFamily "Hack Nerd Font"
Set FontSize 18
Set LineHeight 1.3
Set Width 1100
Set Height 740
Set Padding 24
Set Margin 28
Set MarginFill "#1e1e2e"
Set BorderRadius 12
Set WindowBar Rings
Set WindowBarSize 32
Set CursorBlink false
Set TypingSpeed 70ms
Set Framerate 15

Env TERM "xterm-256color"
Env COLORTERM "truecolor"
Env FORCE_COLOR "1"
Env LESS "-R"

Hide
Type "cd examples/ts-app"
Enter
Type "clear"
Enter
Show

Sleep 400ms

Type@50ms "fln plan --relevant src/index.ts --budget 200000"
Enter
Sleep 2.2s

Type@40ms "fln --relevant src/index.ts -o snapshot.md"
Enter
Sleep 1.4s

Type@60ms "fln why .env.example --include-hidden"
Enter
Sleep 2s
Sleep 1.2s
