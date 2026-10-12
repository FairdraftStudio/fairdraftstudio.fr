"""Finds screen-size rules in assets/site.css that a later ordinary rule silently overrides.

A rule inside @media (phone or tablet layout) loses to a rule with the same selector and the same
property written further down the file. On 11 Oct the home's phone layout broke that way (cards stayed
in four columns at 375 px): the new sections' base rules sat below the media blocks.

Run: python build/check_css.py     (from the site folder or the workspace root)
"""
import re
import sys
from pathlib import Path

CSS = Path(__file__).resolve().parent.parent / "assets" / "site.css"


def rules(text):
    """Yields (position, in_media, selector, properties) for every style rule, in file order."""
    text = re.sub(r"/\*.*?\*/", lambda m: " " * len(m.group(0)), text, flags=re.S)
    i, depth_media, stack = 0, 0, []
    start = 0
    while i < len(text):
        c = text[i]
        if c == "{":
            head = text[start:i].strip()
            if head.startswith("@"):
                stack.append("media" if head.startswith("@media") else "at")
                depth_media += head.startswith("@media")
                start = i + 1
            else:
                j = text.index("}", i)
                props = {d.split(":", 1)[0].strip() for d in text[i + 1:j].split(";") if ":" in d}
                for sel in head.split(","):
                    yield i, depth_media > 0, " ".join(sel.split()), props
                i, start = j, j + 1
        elif c == "}":
            if stack:
                depth_media -= stack.pop() == "media"
            start = i + 1
        i += 1


def main():
    text = (Path(sys.argv[1]) if len(sys.argv) > 1 else CSS).read_text(encoding="utf-8")
    line = lambda pos: text.count("\n", 0, pos) + 1
    found = list(rules(text))
    problems = []
    for pos, media, sel, props in found:
        if not media:
            continue
        for later_pos, later_media, later_sel, later_props in found:
            if later_pos > pos and not later_media and later_sel == sel and props & later_props:
                problems.append(f"line {line(pos)}: @media rule for '{sel}' ({', '.join(sorted(props & later_props))}) "
                                f"is overridden by the ordinary rule at line {line(later_pos)}")
    for p in problems:
        print(p)
    print(f"{len(found)} selectors read, {len(problems)} media rule(s) overridden")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
