package config

type Config struct {
	ProjectName   string
	InputPath     string
	MinLineLength int
}

func LoadConfig() Config {
	return Config{
		ProjectName:   "go-app",
		InputPath:     "sample.txt",
		MinLineLength: 3,
	}
}
