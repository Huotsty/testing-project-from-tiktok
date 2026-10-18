# Build stage
FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o alphaforge-quant .

# Minimal runtime stage
FROM alpine:latest
RUN apk --no-cache add ca-certificates

WORKDIR /root/
COPY --from=builder /app/alphaforge-quant .

EXPOSE 4050

ENTRYPOINT ["./alphaforge-quant", "paxgusdt"]
