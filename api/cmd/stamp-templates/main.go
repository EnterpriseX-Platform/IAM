// stamp-templates sets the Excel document Subject property on the static import
// template files so the import handler can validate file type from metadata.
// Run once: go run ./cmd/stamp-templates
package main

import (
	"fmt"
	"github.com/xuri/excelize/v2"
)

func main() {
	files := map[string]string{
		`C:\GIT\iamxapp\web\public\template\import_internal.xlsx`: "internal",
		`C:\GIT\iamxapp\web\public\template\import_agency.xlsx`:   "agency",
	}
	for path, empType := range files {
		f, err := excelize.OpenFile(path)
		if err != nil {
			fmt.Printf("ERROR opening %s: %v\n", path, err)
			continue
		}
		if err := f.SetDocProps(&excelize.DocProperties{Subject: empType}); err != nil {
			fmt.Printf("ERROR setting props on %s: %v\n", path, err)
			f.Close()
			continue
		}
		if err := f.Save(); err != nil {
			fmt.Printf("ERROR saving %s: %v\n", path, err)
		} else {
			fmt.Printf("OK: %s → Subject=%s\n", path, empType)
		}
		f.Close()
	}
}
