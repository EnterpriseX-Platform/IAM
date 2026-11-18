package utils

import "github.com/nrednav/cuid2"

func NewCUID() string { return cuid2.Generate() }
