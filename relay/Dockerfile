# The relay as a container (relay/README.md). Built by .github/workflows/release.yml
# from the Linux binaries CI already built and tested, for amd64 and arm64.
FROM gcr.io/distroless/static-debian12:nonroot
ARG TARGETARCH
LABEL org.opencontainers.image.source="https://github.com/zjs/planning-board"
LABEL org.opencontainers.image.description="Planning Board relay: shares plans end-to-end encrypted"
LABEL org.opencontainers.image.licenses="Apache-2.0"
COPY --chown=65532:65532 data/ /data/
COPY --chmod=755 planning-board-relay-linux-${TARGETARCH} /planning-board-relay
VOLUME /data
EXPOSE 8787
ENTRYPOINT ["/planning-board-relay", "-data", "/data", "-announce=false"]
