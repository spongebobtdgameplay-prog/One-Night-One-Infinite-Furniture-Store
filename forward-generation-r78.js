const Game = window.__STORE_GAME__;
if (!Game?.Scene || !Game?.ActiveChunks || !Game?.PreparedChunks || !Game?.CollisionBoxes || !Game?.Tasks) {
  throw new Error("Game must load before forward generation authority.");
}

// Chunk 0 is now the physical rear/start boundary. Infinite generation only
// continues into positive chunk indices from there.
const MinimumChunkIndex = 0;
const FakeChunks = new Map();

function FakeChunk(Index) {
  if (!FakeChunks.has(Index)) {
    FakeChunks.set(Index, {
      Id: `Blocked-Rear-${Index}`,
      Index,
      Ready: true,
      Active: false,
      Cancelled: true,
      Group: null,
      Models: [],
      CollisionEntries: [],
      TaskRecords: [],
      StructureBounds: [],
      ReservedBounds: []
    });
  }
  return FakeChunks.get(Index);
}

function RemoveChunk(Chunk) {
  if (!Chunk || Chunk.Index >= MinimumChunkIndex) return;
  Game.Scene.remove(Chunk.Group);
  for (const Object of Chunk.ExternalObjects || []) Game.Scene.remove(Object);
  for (const Task of Chunk.TaskRecords || []) Game.Tasks.delete(Task.Id);

  for (let Index = Game.CollisionBoxes.length - 1; Index >= 0; Index -= 1) {
    if (Game.CollisionBoxes[Index]?.ChunkId === Chunk.Id) Game.CollisionBoxes.splice(Index, 1);
  }

  for (const Entry of Chunk.CollisionEntries || []) Entry.Active = false;
  Chunk.Active = false;
  Chunk.Cancelled = true;
  Game.ActiveChunks.delete(Chunk.Index);
  Game.PreparedChunks.delete(Chunk.Index);
}

for (const Chunk of [...Game.ActiveChunks.values()]) RemoveChunk(Chunk);
for (const Chunk of [...Game.PreparedChunks.values()]) RemoveChunk(Chunk);

const NativeActiveHas = Game.ActiveChunks.has.bind(Game.ActiveChunks);
const NativePreparedGet = Game.PreparedChunks.get.bind(Game.PreparedChunks);

Game.ActiveChunks.has = function(Index) {
  if (Number.isInteger(Index) && Index < MinimumChunkIndex) return true;
  return NativeActiveHas(Index);
};

Game.PreparedChunks.get = function(Index) {
  if (Number.isInteger(Index) && Index < MinimumChunkIndex) return FakeChunk(Index);
  return NativePreparedGet(Index);
};

window.__STORE_FORWARD_GENERATION_R78__ = {
  MinimumChunkIndex,
  RemoveChunk
};
window.__STORE_FORWARD_GENERATION_BUILD__ = "V0.27.7-R88";