PATH := node_modules/.bin:$(PATH)
SHELL := env PATH=$(PATH) /bin/bash

.PHONY: default
default: clean dist

.PHONY: clean
clean:
	rm -rf dist

.PHONY: tests
tests:
	jest --silent

dist:
	tsc
	chmod +x dist/repl.js
