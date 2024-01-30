#!/usr/bin/env node
import * as core from "@actions/core";
import * as github from "@actions/github";
import * as tc from "@actions/tool-cache";
import * as semver from "semver";
import { createUnauthenticatedAuth } from "@octokit/auth-unauthenticated";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "execa";
import * as cache from "@actions/cache";

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

const workflowCache = core.getBooleanInput("cache");

let found = tc.find("hayagriva", version);
let cacheHit = !!found;
if (!found) {
  const cacheDir = join(process.env.RUNNER_TEMP!, Math.random().toString());
  await mkdir(cacheDir, { recursive: true });

  install_hayagriva: {
    if (workflowCache) {
      const primaryKey = `hayagriva-${version}`;
      core.saveState("cache-key", primaryKey);
      const hitKey = await cache.restoreCache([cacheDir], primaryKey);
      if (hitKey) {
        found = cacheDir;
        cacheHit = true;
        break install_hayagriva;
      }
    }

    await $({
      stdio: "inherit",
    })`cargo binstall hayagriva --version ${version} --force -y --install-path ${cacheDir} --features cli`;

    if (workflowCache) {
      const primaryKey = core.getState("cache-key");
      await cache.saveCache([cacheDir], primaryKey);
    }
  }

  found = await tc.cacheDir(cacheDir, "hayagriva", version);
}
core.setOutput("cache-hit", cacheHit);
core.addPath(found);
core.setOutput("hayagriva-version", version);
core.info(`✅ hayagriva v${version} installed!`);
