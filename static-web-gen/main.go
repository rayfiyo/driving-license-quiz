package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"
)

type workbookFile struct {
	Workbook  int        `json:"workbook"`
	Questions []question `json:"questions"`
}

type question struct {
	QNum      int           `json:"q_num"`
	ImagePath string        `json:"image_path,omitempty"`
	Subs      []subQuestion `json:"subs"`
}

type subQuestion struct {
	QSub int    `json:"q_sub"`
	Text string `json:"question"`
}

type workbookIndexItem struct {
	Workbook      int    `json:"workbook"`
	QuestionCount int    `json:"question_count"`
	Path          string `json:"path"`
}

type workbookIndex struct {
	GeneratedAt string              `json:"generated_at"`
	Workbooks   []workbookIndexItem `json:"workbooks"`
}

func main() {
	datasetDir := flag.String("dataset", "../dataset", "path to dataset directory")
	outDir := flag.String("out", "../site/static/quiz-data", "path to Hugo static data directory")
	workbookContentDir := flag.String("content", "../site/content/workbook", "path to Hugo workbook content directory")
	postContentDir := flag.String("post-content", "../site/content/post", "path to Hugo post content directory")
	flag.Parse()

	if err := build(*datasetDir, *outDir, *workbookContentDir, *postContentDir); err != nil {
		fmt.Fprintf(os.Stderr, "build failed: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("generated quiz data: %s\n", *outDir)
	fmt.Printf("generated workbook pages: %s\n", *workbookContentDir)
	fmt.Printf("generated post pages: %s\n", *postContentDir)
}

func build(datasetDir, outDir, workbookContentDir, postContentDir string) error {
	matches, err := filepath.Glob(filepath.Join(datasetDir, "workbook-*.json"))
	if err != nil {
		return fmt.Errorf("glob dataset: %w", err)
	}
	if len(matches) == 0 {
		return fmt.Errorf("no workbook files found in %s", datasetDir)
	}
	sort.Strings(matches)

	if err := copyDatasetImages(datasetDir, outDir); err != nil {
		return err
	}

	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return fmt.Errorf("create output dir: %w", err)
	}
	if err := os.MkdirAll(workbookContentDir, 0o755); err != nil {
		return fmt.Errorf("create workbook content dir: %w", err)
	}
	if err := os.MkdirAll(postContentDir, 0o755); err != nil {
		return fmt.Errorf("create post content dir: %w", err)
	}

	index := workbookIndex{GeneratedAt: time.Now().UTC().Format(time.RFC3339)}

	for _, src := range matches {
		body, err := os.ReadFile(src)
		if err != nil {
			return fmt.Errorf("read %s: %w", src, err)
		}

		var wb workbookFile
		if err := json.Unmarshal(body, &wb); err != nil {
			return fmt.Errorf("parse %s: %w", src, err)
		}
		if wb.Workbook <= 0 {
			return fmt.Errorf("invalid workbook number in %s", src)
		}

		questionCount := 0
		for _, q := range wb.Questions {
			questionCount += len(q.Subs)
		}

		name := fmt.Sprintf("workbook-%d.json", wb.Workbook)
		dst := filepath.Join(outDir, name)
		if err := os.WriteFile(dst, body, 0o644); err != nil {
			return fmt.Errorf("write %s: %w", dst, err)
		}

		index.Workbooks = append(index.Workbooks, workbookIndexItem{
			Workbook:      wb.Workbook,
			QuestionCount: questionCount,
			Path:          name,
		})

		pageName := fmt.Sprintf("workbook-%d.md", wb.Workbook)
		if err := writeWorkbookPage(workbookContentDir, pageName, wb.Workbook); err != nil {
			return err
		}
		if err := writePostPage(postContentDir, pageName, wb.Workbook); err != nil {
			return err
		}
	}

	sort.Slice(index.Workbooks, func(i, j int) bool {
		return index.Workbooks[i].Workbook < index.Workbooks[j].Workbook
	})

	indexBody, err := json.MarshalIndent(index, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal index: %w", err)
	}
	indexBody = append(indexBody, '\n')

	indexPath := filepath.Join(outDir, "index.json")
	if err := os.WriteFile(indexPath, indexBody, 0o644); err != nil {
		return fmt.Errorf("write %s: %w", indexPath, err)
	}
	return nil
}

func writeWorkbookPage(dir, pageName string, workbook int) error {
	pagePath := filepath.Join(dir, pageName)
	pageBody := fmt.Sprintf(
		"+++\n"+
			"title = \"Workbook %d\"\n"+
			"date = \"2026-03-11T00:00:00+09:00\"\n"+
			"draft = false\n"+
			"type = \"workbook\"\n"+
			"workbook = %d\n"+
			"+++\n",
		workbook,
		workbook,
	)
	if err := os.WriteFile(pagePath, []byte(pageBody), 0o644); err != nil {
		return fmt.Errorf("write %s: %w", pagePath, err)
	}
	return nil
}

func writePostPage(dir, pageName string, workbook int) error {
	pagePath := filepath.Join(dir, pageName)
	pageBody := fmt.Sprintf(
		"+++\n"+
			"title = \"Workbook %d 解答一覧\"\n"+
			"date = \"2026-03-11T00:00:00+09:00\"\n"+
			"draft = false\n"+
			"workbook = %d\n"+
			"+++\n",
		workbook,
		workbook,
	)
	if err := os.WriteFile(pagePath, []byte(pageBody), 0o644); err != nil {
		return fmt.Errorf("write %s: %w", pagePath, err)
	}
	return nil
}

func copyDatasetImages(datasetDir, outDir string) error {
	srcDir := filepath.Join(datasetDir, "images")
	info, err := os.Stat(srcDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("stat %s: %w", srcDir, err)
	}
	if !info.IsDir() {
		return nil
	}

	entries, err := os.ReadDir(srcDir)
	if err != nil {
		return fmt.Errorf("read %s: %w", srcDir, err)
	}

	dstDir := filepath.Join(outDir, "images")
	if err := os.MkdirAll(dstDir, 0o755); err != nil {
		return fmt.Errorf("create %s: %w", dstDir, err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		srcPath := filepath.Join(srcDir, entry.Name())
		dstPath := filepath.Join(dstDir, entry.Name())

		body, err := os.ReadFile(srcPath)
		if err != nil {
			return fmt.Errorf("read %s: %w", srcPath, err)
		}
		if err := os.WriteFile(dstPath, body, 0o644); err != nil {
			return fmt.Errorf("write %s: %w", dstPath, err)
		}
	}
	return nil
}
