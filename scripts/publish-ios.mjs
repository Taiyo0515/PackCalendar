import { readFile } from "node:fs/promises";
const tag = process.env.CM_TAG;
if (!tag) {
  console.log("Manual build: IPA is available in Codemagic artifacts.");
  process.exit(0);
}
if (!/^ios-v[\w.-]+$/.test(tag)) throw new Error("Unexpected release tag");
const token = process.env.GH_TOKEN;
if (!token)
  throw new Error(
    "Set encrypted GH_TOKEN in Codemagic (PackCalendar repository, Contents: write). The IPA remains available as a build artifact.",
  );
const repo = "Taiyo0515/PackCalendar";
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};
let response = await fetch(
  `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`,
  { headers },
);
if (response.status === 404)
  response = await fetch(`https://api.github.com/repos/${repo}/releases`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: tag,
      name: `PackCalendar ${tag}`,
      body: "SideStoreで署名してインストールする未署名iOSアプリです。導入手順はリポジトリの docs/DEPLOYMENT.md を参照してください。",
      prerelease: true,
    }),
  });
if (!response.ok) throw new Error(`Release API: ${response.status}`);
const release = await response.json();
const name = "PackCalendar-unsigned.ipa";
if (release.assets.some((a) => a.name === name))
  throw new Error("Release already contains the IPA; use a new tag.");
response = await fetch(`${release.upload_url.split("{")[0]}?name=${name}`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/octet-stream" },
  body: await readFile(`build/ios/${name}`),
});
if (!response.ok) throw new Error(`Artifact upload: ${response.status}`);
console.log(`Published ${repo} ${tag}`);
