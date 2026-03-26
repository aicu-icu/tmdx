.PHONY: build run clean

build:
	npm run build
	go build -o tmd-cloud ./cmd/cloud/

run: build
	./tmd-cloud

clean:
	rm -f tmd-cloud
	rm -rf data/
