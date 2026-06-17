"""Task 1 verification: confirm band-sdk (import name `band`) + CrewAI import cleanly.

Run: uv run python verify_setup.py
"""

import sys


def main() -> int:
    try:
        import band
        from band import Agent  # noqa: F401
        import band.integrations.crewai  # noqa: F401  (CrewAI integration)
        import crewai
    except Exception as exc:  # pragma: no cover - setup smoke test
        print(f"FAIL: import error -> {exc!r}")
        print(
            "Hint: install with `uv add \"band-sdk[crewai]\"` "
            "(public package is band-sdk; import name is `band`)."
        )
        return 1

    band_ver = getattr(band, "__version__", "?")
    crewai_ver = getattr(crewai, "__version__", "?")
    print("OK: band-sdk (import `band`) and crewai import cleanly")
    print(f"  python : {sys.version.split()[0]}")
    print(f"  band   : {band_ver}")
    print(f"  crewai : {crewai_ver}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
