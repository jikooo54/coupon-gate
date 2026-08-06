import os


_real_unlink = os.unlink


def _windows_tolerant_unlink(path, *args, **kwargs):
    try:
        _real_unlink(path, *args, **kwargs)
    except PermissionError:
        # gltest injects GenLayer calldata by duping a temp file onto fd 0.
        # On Windows that handle can still be considered open at unlink time;
        # ignoring this cleanup failure keeps direct tests runnable locally.
        pass


os.unlink = _windows_tolerant_unlink
