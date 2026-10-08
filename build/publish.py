"""Publish the site to suivel.fr (public repo FairdraftStudio/fairdraftstudio.fr, GitHub Pages).

    python repos/fairdraftstudio.fr/build/publish.py "What changed"

1. Rebuilds the pages with build_site.py.
2. Stops if anything in this folder is not committed in the workspace: what goes live must be
   exactly what was reviewed and committed.
3. Copies every file git tracks in this folder into a clone of the public repo (kept in the system
   temp folder), removes files that no longer exist here, commits as FairdraftStudio and pushes.
GitHub Pages then rebuilds the site; it is live about a minute later.
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REMOTE = "https://github.com/FairdraftStudio/fairdraftstudio.fr.git"
CLONE = Path(tempfile.gettempdir()) / "fairdraftstudio.fr-public"
AUTHOR = ["-c", "user.name=FairdraftStudio",
          "-c", "user.email=327933373+FairdraftStudio@users.noreply.github.com"]


def git(*args, cwd, capture=False):
    result = subprocess.run(["git", *args], cwd=cwd, check=True, text=True,
                            capture_output=capture)
    return result.stdout if capture else None


def main():
    message = sys.argv[1] if len(sys.argv) > 1 else "Site update"
    subprocess.run([sys.executable, str(ROOT / "build" / "build_site.py")], check=True)

    dirty = git("status", "--porcelain", "--", ".", cwd=ROOT, capture=True).strip()
    if dirty:
        sys.exit("Not published: commit these changes in the workspace first (after review):\n" + dirty)

    if (CLONE / ".git").exists():
        git("fetch", "-q", "origin", cwd=CLONE)
        git("reset", "-q", "--hard", "origin/main", cwd=CLONE)
    else:
        if CLONE.exists():
            shutil.rmtree(CLONE)
        git("clone", "-q", REMOTE, str(CLONE), cwd=ROOT)

    wanted = set(git("ls-files", "-z", cwd=ROOT, capture=True).split("\0")) - {""}
    present = set(git("ls-files", "-z", cwd=CLONE, capture=True).split("\0")) - {""}
    for rel in present - wanted:
        (CLONE / rel).unlink()
    for rel in wanted:
        target = CLONE / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / rel, target)

    git("add", "-A", cwd=CLONE)
    if not git("status", "--porcelain", cwd=CLONE, capture=True).strip():
        print("Nothing to publish: the live site already matches.")
        return
    git(*AUTHOR, "commit", "-q", "-m", message, cwd=CLONE)
    git("push", "-q", "origin", "main", cwd=CLONE)
    print("Published: " + git("log", "--oneline", "-1", cwd=CLONE, capture=True).strip())
    print("Live on https://suivel.fr/ in about a minute.")


if __name__ == "__main__":
    main()
