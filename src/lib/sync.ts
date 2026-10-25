import prisma from "@/lib/prisma";

interface GitHubRepo {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string };
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  archived: boolean;
  html_url: string;
  homepage: string | null;
  topics: string[];
  pushed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface StarredRepo extends GitHubRepo {
  starred_at?: string;
}

export class SyncError extends Error {
  constructor(
    message: string,
    readonly kind: "no_token" | "github_api" | "unknown"
  ) {
    super(message);
    this.name = "SyncError";
  }
}

async function fetchAllStarredRepos(
  accessToken: string
): Promise<StarredRepo[]> {
  const repos: StarredRepo[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const response = await fetch(
      `https://api.github.com/user/starred?per_page=${perPage}&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.star+json", // 获取 starred_at 信息
        },
      }
    );

    if (!response.ok) {
      throw new SyncError(
        `GitHub API error: ${response.status}`,
        "github_api"
      );
    }

    const data = await response.json();

    if (data.length === 0) break;

    // API 返回的格式是 { starred_at, repo } 当使用 star+json accept header
    for (const item of data) {
      const repo = item.repo || item;
      repos.push({
        ...repo,
        starred_at: item.starred_at,
      });
    }

    if (data.length < perPage) break;
    page++;
  }

  return repos;
}

/**
 * 同步指定用户的 GitHub 星标仓库。
 * 供手动同步接口和后台定时任务复用，调用方负责鉴权。
 */
export async function syncUserStars(
  userId: string
): Promise<{ count: number }> {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "github",
    },
    select: { access_token: true },
  });

  if (!account?.access_token) {
    throw new SyncError("No access token", "no_token");
  }

  // 从 GitHub 获取所有 starred 仓库
  const starredRepos = await fetchAllStarredRepos(account.access_token);

  // 批量处理仓库
  for (const repo of starredRepos) {
    // 创建或更新仓库信息
    const repository = await prisma.repository.upsert({
      where: { githubId: repo.id },
      update: {
        fullName: repo.full_name,
        name: repo.name,
        owner: repo.owner.login,
        description: repo.description,
        language: repo.language,
        stargazersCount: repo.stargazers_count,
        forksCount: repo.forks_count,
        isArchived: repo.archived,
        htmlUrl: repo.html_url,
        homepage: repo.homepage,
        topics: JSON.stringify(repo.topics || []),
        pushedAt: repo.pushed_at ? new Date(repo.pushed_at) : null,
        repoCreatedAt: repo.created_at ? new Date(repo.created_at) : null,
        repoUpdatedAt: repo.updated_at ? new Date(repo.updated_at) : null,
      },
      create: {
        githubId: repo.id,
        fullName: repo.full_name,
        name: repo.name,
        owner: repo.owner.login,
        description: repo.description,
        language: repo.language,
        stargazersCount: repo.stargazers_count,
        forksCount: repo.forks_count,
        isArchived: repo.archived,
        htmlUrl: repo.html_url,
        homepage: repo.homepage,
        topics: JSON.stringify(repo.topics || []),
        pushedAt: repo.pushed_at ? new Date(repo.pushed_at) : null,
        repoCreatedAt: repo.created_at ? new Date(repo.created_at) : null,
        repoUpdatedAt: repo.updated_at ? new Date(repo.updated_at) : null,
      },
    });

    // 创建或更新用户-仓库关联
    await prisma.userRepository.upsert({
      where: {
        userId_repositoryId: {
          userId,
          repositoryId: repository.id,
        },
      },
      update: {
        isStarred: true,
        starredAt: repo.starred_at ? new Date(repo.starred_at) : new Date(),
      },
      create: {
        userId,
        repositoryId: repository.id,
        starredAt: repo.starred_at ? new Date(repo.starred_at) : new Date(),
        isStarred: true,
      },
    });
  }

  // 更新用户最后同步时间
  await prisma.user.update({
    where: { id: userId },
    data: { lastSyncAt: new Date() },
  });

  // 标记不再 starred 的仓库
  const currentGithubIds = starredRepos.map((r) => r.id);
  const userRepos = await prisma.userRepository.findMany({
    where: { userId, isStarred: true },
    include: { repository: true },
  });

  for (const userRepo of userRepos) {
    if (!currentGithubIds.includes(userRepo.repository.githubId)) {
      await prisma.userRepository.update({
        where: { id: userRepo.id },
        data: { isStarred: false },
      });
    }
  }

  return { count: starredRepos.length };
}
