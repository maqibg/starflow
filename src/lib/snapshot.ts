import prisma from "@/lib/prisma";

/**
 * 整理快照：把「Lists 的组织关系 + 仓库笔记」整体存成一份 JSON。
 *
 * 只记录用户整理出来的内容，不记录仓库本体（仓库来自 GitHub，可重新同步），
 * 所以恢复时用 fullName 反查当前已关联的仓库，查不到的跳过并计数。
 */

interface SnapshotList {
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  order: number;
  repos: string[]; // 仓库 fullName
}

interface SnapshotNote {
  fullName: string;
  content: string;
  createdAt: string;
}

export interface SnapshotPayload {
  version: 1;
  lists: SnapshotList[];
  notes: SnapshotNote[];
}

export interface SnapshotSummary {
  id: string;
  label: string;
  listCount: number;
  noteCount: number;
  repoCount: number;
  createdAt: Date;
}

/**
 * 拍一张快照。当前没有任何 Lists 与笔记时返回 null，不制造空快照。
 */
export async function createOrganizeSnapshot(
  userId: string,
  label: string
): Promise<SnapshotSummary | null> {
  const lists = await prisma.list.findMany({
    where: { userId },
    orderBy: { order: "asc" },
    include: {
      repositories: {
        include: {
          userRepository: {
            include: {
              repository: { select: { fullName: true } },
            },
          },
        },
      },
    },
  });

  const notes = await prisma.note.findMany({
    where: { userId },
    include: {
      repository: { select: { fullName: true } },
    },
  });

  if (lists.length === 0 && notes.length === 0) {
    return null;
  }

  const payload: SnapshotPayload = {
    version: 1,
    lists: lists.map((list) => ({
      name: list.name,
      description: list.description,
      color: list.color,
      icon: list.icon,
      order: list.order,
      repos: list.repositories.map(
        (item) => item.userRepository.repository.fullName
      ),
    })),
    notes: notes.map((note) => ({
      fullName: note.repository.fullName,
      content: note.content,
      createdAt: note.createdAt.toISOString(),
    })),
  };

  const repoCount = new Set(payload.lists.flatMap((list) => list.repos)).size;

  const snapshot = await prisma.organizeSnapshot.create({
    data: {
      userId,
      label,
      payload: JSON.stringify(payload),
      listCount: lists.length,
      noteCount: notes.length,
      repoCount,
    },
    select: {
      id: true,
      label: true,
      listCount: true,
      noteCount: true,
      repoCount: true,
      createdAt: true,
    },
  });

  return snapshot;
}

export interface RestoreResult {
  snapshot: SnapshotSummary;
  restoredLists: number;
  restoredLinks: number;
  restoredNotes: number;
  skippedRepos: number;
}

/**
 * 恢复快照。不传 snapshotId 时取最近一张。
 * 会先清空当前 Lists 与笔记，再按快照重建，属于覆盖式恢复。
 */
export async function restoreOrganizeSnapshot(
  userId: string,
  snapshotId?: string
): Promise<RestoreResult> {
  const snapshot = snapshotId
    ? await prisma.organizeSnapshot.findFirst({
        where: { id: snapshotId, userId },
      })
    : await prisma.organizeSnapshot.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });

  if (!snapshot) {
    throw new Error("没有找到可恢复的快照");
  }

  let payload: SnapshotPayload;
  try {
    payload = JSON.parse(snapshot.payload) as SnapshotPayload;
  } catch {
    throw new Error("快照内容已损坏，无法恢复");
  }

  if (payload.version !== 1) {
    throw new Error("快照版本不受支持");
  }

  // fullName 反查：列表关系需要 UserRepository.id，笔记需要 Repository.id
  const entries = await prisma.userRepository.findMany({
    where: { userId },
    select: {
      id: true,
      repository: { select: { id: true, fullName: true } },
    },
  });

  const userRepoIdByFullName = new Map<string, string>();
  const repositoryIdByFullName = new Map<string, string>();
  for (const entry of entries) {
    const key = entry.repository.fullName.toLowerCase();
    userRepoIdByFullName.set(key, entry.id);
    repositoryIdByFullName.set(key, entry.repository.id);
  }

  let restoredLists = 0;
  let restoredLinks = 0;
  let restoredNotes = 0;
  let skippedRepos = 0;

  await prisma.$transaction(
    async (tx) => {
      await tx.listRepository.deleteMany({ where: { list: { userId } } });
      await tx.list.deleteMany({ where: { userId } });
      await tx.note.deleteMany({ where: { userId } });

      for (const list of payload.lists) {
        const created = await tx.list.create({
          data: {
            userId,
            name: list.name,
            description: list.description,
            color: list.color,
            icon: list.icon,
            order: list.order,
          },
        });
        restoredLists++;

        const linkIds: string[] = [];
        for (const fullName of list.repos) {
          const userRepositoryId = userRepoIdByFullName.get(
            fullName.toLowerCase()
          );
          if (!userRepositoryId) {
            skippedRepos++;
            continue;
          }
          linkIds.push(userRepositoryId);
        }

        if (linkIds.length > 0) {
          await tx.listRepository.createMany({
            data: linkIds.map((userRepositoryId) => ({
              listId: created.id,
              userRepositoryId,
            })),
            skipDuplicates: true,
          });
          restoredLinks += linkIds.length;
        }
      }

      for (const note of payload.notes) {
        const repositoryId = repositoryIdByFullName.get(
          note.fullName.toLowerCase()
        );
        if (!repositoryId) {
          continue;
        }
        await tx.note.create({
          data: {
            userId,
            repositoryId,
            content: note.content,
          },
        });
        restoredNotes++;
      }
    },
    { timeout: 30000 }
  );

  return {
    snapshot: {
      id: snapshot.id,
      label: snapshot.label,
      listCount: snapshot.listCount,
      noteCount: snapshot.noteCount,
      repoCount: snapshot.repoCount,
      createdAt: snapshot.createdAt,
    },
    restoredLists,
    restoredLinks,
    restoredNotes,
    skippedRepos,
  };
}

export async function listSnapshots(
  userId: string,
  take = 10
): Promise<SnapshotSummary[]> {
  return prisma.organizeSnapshot.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      label: true,
      listCount: true,
      noteCount: true,
      repoCount: true,
      createdAt: true,
    },
  });
}
