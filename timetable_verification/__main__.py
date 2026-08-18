"""Allow ``python -m timetable_verification`` as a convenience alias."""

from .check_sources import main


raise SystemExit(main())
