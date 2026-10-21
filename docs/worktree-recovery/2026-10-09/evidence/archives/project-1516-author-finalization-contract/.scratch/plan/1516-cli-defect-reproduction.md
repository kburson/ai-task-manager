1. Complete an ordinary review through reviewer acceptance so its state is `acceptance-pending`.
2. Run `peer-review finalize <workspace>` from the registered author session.
3. Observe that finalization creates its terminal commit and event.
4. Observe the CLI subsequently throws while rendering `value.next_action.command` because terminal `next_action` is null, emits `APR_INTERNAL`, and exits 1.
