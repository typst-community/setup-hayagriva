#!/usr/bin/env node
import * as core from "@actions/core";
import * as github from "@actions/github";
import * as tc from "@actions/tool-cache";
import * as semver from "semver";
import { createUnauthenticatedAuth } from "@octokit/auth-unauthenticated";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "execa";

const token = core.getInput("hayagriva-token");
const octokit = token
  ? github.getOctokit(token)
  : github.getOctokit(undefined!, {
      authStrategy: createUnauthenticatedAuth,
      auth: { reason: "no 'hayagriva-token' input" },
    });

const versionRaw = core.getInput("hayagriva-version");
let version: string;
if (versionRaw === "latest") {
  const { data } = await octokit.rest.repos.getLatestRelease({
    owner: "typst",
    repo: "hayagriva",
  });
  version = data.tag_name.slice(1);
} else {
  const releases = await octokit.paginate(octokit.rest.repos.listReleases, {
    owner: "typst",
    repo: "hayagriva",
  });
  const versions = releases.map((release) => release.tag_name.slice(1));
  version = semver.maxSatisfying(versions, versionRaw)!;
}
core.debug(`Resolved version: v${version}`);
if (!version) throw new DOMException(`${versionRaw} resolved to ${version}`);

let found = tc.find("hayagriva", version);
core.setOutput("cache-hit", !!found);
if (!found) {
  const cacheDir = join(process.env.RUNNER_TEMP!, Math.random().toString());
  await mkdir(cacheDir, { recursive: true });
  await $({
    stdio: "inherit",
  })`cargo binstall hayagriva --version ${version} --force -y --install-path ${cacheDir}`;
  found = await tc.cacheDir(cacheDir, "hayagriva", version);
}
core.addPath(found);
core.setOutput("hayagriva-version", version);
core.info(`✅ hayagriva v${version} installed!`);
