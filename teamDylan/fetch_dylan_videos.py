import re
import time
from collections import OrderedDict
from dataclasses import dataclass
from html import escape
from pathlib import Path
from typing import Dict, Iterable, List, Optional
from urllib.parse import parse_qs, unquote, urlparse

import requests

CHANNEL_HANDLE = "@DylanStarkTV"
CHANNEL_ID = "UCjI3-FRNbKFvnrG4iDnQCQw"
UPLOADS_PLAYLIST_ID = "UUjI3-FRNbKFvnrG4iDnQCQw"
R_JINA_BASE = "https://r.jina.ai/"
PLAYLIST_URL = f"https://www.youtube.com/{CHANNEL_HANDLE}/videos"
ALT_PLAYLIST_URL = f"https://m.youtube.com/channel/{CHANNEL_ID}/videos"
VIDEO_URL_TEMPLATE = "https://www.youtube.com/watch?v={video_id}"
OUTPUT_DIR = Path(__file__).resolve().parent
VIDEO_DESCS_FILE = OUTPUT_DIR / "video_descs.txt"
PLAYLIST_FILE = OUTPUT_DIR / "playlist.txt"
PLAYLIST_HTML_FILE = OUTPUT_DIR / "playlist.html"
SEPARATOR = "=" * 80
SESSION = requests.Session()

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}


def _log(message: str) -> None:
    print(message, flush=True)


def fetch_text(url: str) -> Optional[str]:
    try:
        response = SESSION.get(f"{R_JINA_BASE}{url}", headers=HEADERS, timeout=30)
        response.raise_for_status()
        return response.text
    except requests.RequestException as exc:
        _log(f"Failed to fetch {url}: {exc}")
        return None


_VIDEO_URL_RE = re.compile(r"https://(?:www|m)\.youtube\.com/watch\?v=([A-Za-z0-9_-]{11})")


def extract_video_ids(text: str) -> List[str]:
    ids = OrderedDict()
    for match in _VIDEO_URL_RE.finditer(text):
        video_id = match.group(1)
        ids.setdefault(video_id, None)
    return list(ids.keys())


_LINK_MARKDOWN_RE = re.compile(r"(!?)\[([^\]]+)\]\(([^)]+)\)")


def _clean_markdown_links(text: str) -> str:
    def _replace(match: re.Match[str]) -> str:
        prefix = match.group(1)
        label = match.group(2)
        url = match.group(3)
        if prefix == "!":
            alt_text = label.split("/", 1)[-1]
            alt_text = alt_text or "Image"
            return f"{alt_text} ({url})"
        return f"{label} ({url})"

    return _LINK_MARKDOWN_RE.sub(_replace, text)


def _resolve_music_url(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    if "youtube.com" in host and parsed.path == "/redirect":
        query = parse_qs(parsed.query)
        targets = query.get("q")
        if targets:
            candidate = unquote(targets[0])
            if candidate:
                return candidate
    return url


def _song_name_from_url(url: str) -> Optional[str]:
    parsed = urlparse(url)
    slug = parsed.path.rstrip("/")
    if not slug:
        return None
    name = slug.split("/")[-1]
    return name or None


def parse_description(page_text: str, video_title: str) -> str:
    lines = page_text.splitlines()
    description_lines: List[str] = []
    try:
        start_idx = next(i for i, line in enumerate(lines) if line.strip() == "Description")
    except StopIteration:
        return ""

    idx = start_idx + 1
    while idx < len(lines) and not lines[idx].strip():
        idx += 1
    if idx < len(lines) and set(lines[idx].strip()) == {"-"}:
        idx += 1
    while idx < len(lines) and not lines[idx].strip():
        idx += 1
    if idx < len(lines) and lines[idx].strip() == video_title.strip():
        idx += 1
    metadata_tokens = {"Likes", "Views", "Ago"}
    while idx < len(lines):
        stripped = lines[idx].strip()
        if not stripped:
            idx += 1
            continue
        if any(stripped.endswith(token) for token in metadata_tokens):
            idx += 1
            continue
        break

    while idx < len(lines):
        stripped = lines[idx].strip()
        if stripped.startswith("Transcript") or stripped.startswith("### "):
            break
        if stripped.startswith("How this content was made"):
            break
        if stripped in {"...more", "Show less", "...more Show less", "Show more"}:
            idx += 1
            continue
        description_lines.append(lines[idx])
        idx += 1

    raw_description = "\n".join(description_lines)
    raw_description = raw_description.replace("…...more", "").replace("...more", "")
    cleaned = _clean_markdown_links(raw_description)
    return cleaned.strip()


_TITLE_PREFIX = "Title: "
_TITLE_SUFFIX = " - YouTube"


def parse_title(page_text: str) -> str:
    for line in page_text.splitlines():
        if line.startswith(_TITLE_PREFIX):
            title = line[len(_TITLE_PREFIX) :]
            if title.endswith(_TITLE_SUFFIX):
                title = title[: -len(_TITLE_SUFFIX)]
            return title.strip()
    return "Untitled Video"


def fetch_video_data(video_id: str) -> Optional[Dict[str, str]]:
    video_url = VIDEO_URL_TEMPLATE.format(video_id=video_id)
    for attempt in range(3):
        text = fetch_text(video_url)
        if text is not None:
            title = parse_title(text)
            description = parse_description(text, title)
            return {
                "id": video_id,
                "title": title,
                "url": video_url,
                "description": description,
            }
        wait_time = 2 + attempt
        attempt_num = min(attempt + 2, 3)
        _log(f"Retrying {video_id} in {wait_time}s (attempt {attempt_num}/3)...")
        time.sleep(wait_time)
    return None


def gather_videos() -> List[Dict[str, str]]:
    playlist_text = fetch_text(PLAYLIST_URL)
    if not playlist_text:
        _log("Primary channel page fetch failed, trying mobile page...")
        playlist_text = fetch_text(ALT_PLAYLIST_URL)
    if not playlist_text:
        _log("Unable to fetch channel video pages.")
        return []

    video_ids = extract_video_ids(playlist_text)
    if not video_ids:
        _log("No video IDs found in playlist page.")
        return []

    _log(f"Found {len(video_ids)} video IDs to process.")
    videos: List[Dict[str, str]] = []
    for index, video_id in enumerate(video_ids, start=1):
        _log(f"Fetching video {index}/{len(video_ids)}: {video_id}")
        data = fetch_video_data(video_id)
        if not data:
            continue
        videos.append(data)
        time.sleep(5.0)
    return videos


def write_video_descriptions(videos: Iterable[Dict[str, str]], output_path: Path) -> None:
    lines: List[str] = []
    for video in videos:
        title = video.get("title", "Untitled Video")
        video_url = video.get("url", "")
        description = (video.get("description") or "").strip()
        lines.append(f"Title: {title}")
        lines.append(f"URL: {video_url}")
        lines.append("Description:")
        if description:
            lines.append(description)
        else:
            lines.append("(No description provided)")
        lines.append(SEPARATOR)
    output_path.write_text("\n".join(lines), encoding="utf-8")
    _log(f"Wrote descriptions to {output_path}.")


@dataclass(frozen=True)
class PlaylistEntry:
    video_title: str
    song_label: str
    url: str
    is_generic_label: bool = False


def extract_playlist_entries(desc_file: Path) -> List[PlaylistEntry]:
    text = desc_file.read_text(encoding="utf-8")
    if not text.strip():
        return []

    entries: List[PlaylistEntry] = []
    seen = set()
    song_pattern = re.compile(r"([^()]+?)\((https?://[^)]+)\)")

    current_title = "Unknown Video"
    in_description = False

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line == SEPARATOR:
            in_description = False
            current_title = "Unknown Video"
            continue
        if line.startswith("Title: "):
            current_title = line[len("Title: "):].strip() or "Unknown Video"
            in_description = False
            continue
        if line == "Description:":
            in_description = True
            continue
        if not in_description:
            continue

        for match in song_pattern.finditer(line):
            label = match.group(1).strip(" :-")
            url = match.group(2)
            resolved_url = _resolve_music_url(url)
            lowered = resolved_url.lower()
            if "soundcloud" not in lowered and "spotify" not in lowered:
                continue
            song_label = _song_name_from_url(resolved_url) or label.split("#", 1)[0].strip()
            if ":" in song_label:
                song_label = song_label.rsplit(":", 1)[-1].strip()
            if not song_label:
                song_label = "Song"
            entry_key = (current_title, resolved_url)
            if entry_key in seen:
                continue
            seen.add(entry_key)
            entries.append(
                PlaylistEntry(
                    video_title=current_title,
                    song_label=song_label,
                    url=resolved_url,
                    is_generic_label=song_label.lower() == "song",
                )
            )
    return entries


def write_playlist(entries: Iterable[PlaylistEntry], output_path: Path) -> None:
    lines: List[str] = []
    for entry in entries:
        lines.append(f"Video: {entry.video_title}")
        label = "Song" if entry.is_generic_label else f"Song - {entry.song_label}"
        lines.append(f"  {label}: {entry.url}")
    output_path.write_text("\n".join(lines), encoding="utf-8")
    _log(f"Wrote playlist to {output_path}.")


def write_playlist_html(entries: Iterable[PlaylistEntry], output_path: Path) -> None:
    entries = list(entries)
    grouped: "OrderedDict[str, List[PlaylistEntry]]" = OrderedDict()
    for entry in entries:
        grouped.setdefault(entry.video_title, []).append(entry)

    html_lines = [
        "<!DOCTYPE html>",
        "<html lang=\"en\">",
        "<head>",
        "  <meta charset=\"utf-8\" />",
        "  <title>Dylan Stark Playlist</title>",
        "  <style>",
        "    :root {",
        "      color-scheme: dark light;",
        "    }",
        "    body {",
        "      font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;",
        "      margin: 0;",
        "      padding: 2rem 1.5rem;",
        "      background: linear-gradient(135deg, #111, #1e1e2f);",
        "      color: #f2f5f9;",
        "    }",
        "    main {",
        "      max-width: 960px;",
        "      margin: 0 auto;",
        "      background: rgba(12, 12, 20, 0.8);",
        "      border-radius: 16px;",
        "      box-shadow: 0 18px 45px rgba(0, 0, 0, 0.35);",
        "      padding: 2.5rem 3rem;",
        "      backdrop-filter: blur(8px);",
    ]

    html_lines.extend(
        [
            "    }",
            "    h1 {",
            "      font-size: 2.25rem;",
            "      margin-top: 0;",
            "      letter-spacing: 0.08em;",
            "      text-transform: uppercase;",
            "    }",
            "    p.summary {",
            "      color: #aeb7c6;",
            "      font-size: 0.95rem;",
            "      margin-bottom: 2rem;",
            "    }",
            "    section.video {",
            "      border-left: 3px solid #4fc1ff;",
            "      padding-left: 1.5rem;",
            "      margin-bottom: 2rem;",
            "    }",
            "    section.video h2 {",
            "      margin: 0 0 0.75rem 0;",
            "      font-size: 1.5rem;",
            "      color: #4fc1ff;",
            "    }",
            "    ul.song-list {",
            "      list-style: none;",
            "      padding-left: 0;",
            "      margin: 0;",
            "    }",
            "    ul.song-list li {",
            "      margin-bottom: 0.6rem;",
            "    }",
            "    ul.song-list li a {",
            "      color: #7df9ff;",
            "      text-decoration: none;",
            "      font-weight: 600;",
        ]
    )

    html_lines.extend(
        [
            "    }",
            "    ul.song-list li a:hover,",
            "    ul.song-list li a:focus {",
            "      text-decoration: underline;",
            "    }",
            "    span.platform {",
            "      display: inline-block;",
            "      margin-left: 0.5rem;",
            "      font-size: 0.8rem;",
            "      text-transform: uppercase;",
            "      letter-spacing: 0.05em;",
            "      color: #9fb3c8;",
            "    }",
            "    .empty {",
            "      font-style: italic;",
            "      color: #9fb3c8;",
            "    }",
            "  </style>",
            "</head>",
            "<body>",
            "  <main>",
            "    <h1>Dylan Stark Playlist</h1>",
        ]
    )

    if entries:
        total_videos = len(grouped)
        total_tracks = len(entries)
        html_lines.append(
            f"    <p class=\"summary\">{total_tracks} track{'s' if total_tracks != 1 else ''} "
            f"curated from {total_videos} video{'s' if total_videos != 1 else ''}.</p>"
        )
        for video_title, songs in grouped.items():
            html_lines.append("    <section class=\"video\">")
            html_lines.append(f"      <h2>{escape(video_title)}</h2>")
            html_lines.append("      <ul class=\"song-list\">")
            for song in songs:
                label = "Song" if song.is_generic_label else song.song_label
                platform = ""
                lowered = song.url.lower()
                if "soundcloud" in lowered:
                    platform = "SoundCloud"
                elif "spotify" in lowered:
                    platform = "Spotify"
                platform_html = (
                    f"<span class=\"platform\">{platform}</span>" if platform else ""
                )
                html_lines.append(
                    "        <li>"
                    f"<a href=\"{escape(song.url)}\" target=\"_blank\" rel=\"noopener noreferrer\">"
                    f"{escape(label)}</a>{platform_html}"
                    "</li>"
                )
            html_lines.append("      </ul>")
            html_lines.append("    </section>")
    else:
        html_lines.append(
            "    <p class=\"summary empty\">No SoundCloud or Spotify links were found in the descriptions.</p>"
        )

    html_lines.extend([
        "  </main>",
        "</body>",
        "</html>",
    ])

    output_path.write_text("\n".join(html_lines), encoding="utf-8")
    _log(f"Wrote playlist to {output_path}.")


def main() -> None:
    videos = gather_videos()
    if not videos:
        _log("No videos processed. Exiting.")
        return
    write_video_descriptions(videos, VIDEO_DESCS_FILE)
    playlist_entries = extract_playlist_entries(VIDEO_DESCS_FILE)
    write_playlist(playlist_entries, PLAYLIST_FILE)
    write_playlist_html(playlist_entries, PLAYLIST_HTML_FILE)


if __name__ == "__main__":
    main()
