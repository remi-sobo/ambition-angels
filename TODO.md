# TODO

- [ ] Migrate admin auth from "cookie value === password" to opaque session tokens (server-side store) once we need server-side session revocation. PR 2 chose the smaller-radius cookie-equals-secret model on purpose; this is the eventual upgrade path.
