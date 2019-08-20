import { ChunkManager, WorkerManager, PlayersManager } from '../../managers'
import Helpers from '../../../utils/helpers'
import Stateful from '../../../lib/stateful/stateful'
import { Chat } from '../../interfaces'
import Config from '../../../config/config'
import {
  UPDATE_WORLD_MUTATION,
  WORLD_SUBSCRIPTION,
  UPDATE_BLOCK_MUTATION,
  BLOCK_SUBSCRIPTION
  // OTHER_PLAYERS_SUBSCRIPTION
} from '../../../lib/graphql'

import createSky from './sky/sky'

const CHUNK_SIZE = Config.chunk.size
class World extends Stateful {
  constructor(
    worldData,
    scene,
    apolloClient,
    ioClient,
    container,
    playerData,
    resourceManager
  ) {
    super({ isSetup: false })

    const { id, name, seed, type, time, days, changedBlocks } = worldData
    this.id = id
    this.data = {
      id,
      name,
      seed,
      type,
      time,
      days,
      y: playerData.y,
      playerId: playerData.id,
      user: playerData.user
    }

    this.scene = scene
    this.apolloClient = apolloClient
    this.ioClient = ioClient

    this.chat = new Chat(this.data.playerId, id, container, apolloClient)

    this.workerManager = new WorkerManager(this)
    this.playersManager = new PlayersManager(scene)
    this.chunkManager = new ChunkManager(
      scene,
      this,
      resourceManager,
      this.workerManager,
      changedBlocks
    )
  }

  init = () => {
    this.initPlayer()
    this.initUpdaters()
    this.initSubscriptions()
  }

  initPlayer = () => {
    if (Helpers.approxEquals(this.data.y, Number.MIN_SAFE_INTEGER, 5))
      this.workerManager.queueSpecificChunk({
        cmd: 'GET_HIGHEST',
        x: 0,
        z: 0
      })
    else this.setState({ isSetup: true })
  }

  initUpdaters = () => {
    this.envUpdater = window.requestInterval(this.updateEnv, 100)
  }

  initSubscriptions = () => {
    this.worldSubscription = this.apolloClient
      .subscribe({
        query: WORLD_SUBSCRIPTION,
        variables: {
          worldId: this.data.id,
          mutation_in: ['UPDATED'],
          updatedFields_contains_some: ['timeChanger']
        }
      })
      .subscribe({
        next: ({ data }) => {
          this.handleServerUpdate(data)
        },
        error(e) {
          Helpers.error(e.message)
        }
      })

    this.blockSubscription = this.apolloClient
      .subscribe({
        query: BLOCK_SUBSCRIPTION,
        variables: {
          worldId: this.data.id
        }
      })
      .subscribe({
        next: ({ data }) => {
          console.log('BLOCK', data)
          this.updateChanged(data)
          // this.handleServerUpdate(data)
        },
        error(e) {
          Helpers.error(e.message)
        }
      })

    this.ioClient.on('players', pkg => {
      this.playersManager.update({
        ...pkg.playerCoords,
        ...pkg.playerDir,
        username: pkg.username
      })
    })
  }

  update = () => {
    this.workerManager.update()
    this.chunkManager.update()
    this.sky.tick()
  }

  updateEnv = () => {
    if (!this.state.isSetup) return

    const playerPos = this.player.getCoordinates()
    const { coordx, coordy, coordz } = Helpers.globalBlockToChunkCoords(
      playerPos
    )
    this.chunkManager.surroundingChunksCheck(coordx, coordy, coordz)
  }

  saveApollo = () => {
    this.saveTime()
  }

  saveTime = () => {
    const t = this.sky.getTime()
    if (t) {
      this.apolloClient.mutate({
        mutation: UPDATE_WORLD_MUTATION,
        variables: {
          id: this.data.id,
          time: t
        }
      })
    }

    const days = this.sky.getDays()
    if (days && this.data.days !== days) {
      this.data.days = days
      this.apolloClient.mutate({
        mutation: UPDATE_WORLD_MUTATION,
        variables: {
          id: this.data.id,
          days
        }
      })
    }
  }

  terminate = () => {
    this.worldSubscription.unsubscribe()

    this.getChat().terminate()
    this.removeUpdaters()
  }

  handleServerUpdate = ({
    world: {
      node: { timeChanger }
    }
  }) => {
    this.sky.setTime(timeChanger)
  }

  removeUpdaters = () => {
    window.clearRequestInterval(this.envUpdater)
  }

  /* -------------------------------------------------------------------------- */
  /*                                   SETTERS                                  */
  /* -------------------------------------------------------------------------- */
  setPlayer = player => {
    this.player = player
    this.sky = createSky(this.scene, this, {
      speed: 0.1
    })(this.data.time, this.data.days)
  }

  setTarget = target => (this.targetBlock = target)

  setPotential = potential => (this.potentialBlock = potential)

  /* -------------------------------------------------------------------------- */
  /*                                   GETTERS                                  */
  /* -------------------------------------------------------------------------- */
  getPlayer = () => this.player

  getChat = () => this.chat

  getDays = () => this.data.days

  getVoxelByVoxelCoords = (x, y, z) => {
    /** RETURN INFORMATION ABOUT CHUNKS */
    const type = this.chunkManager.getTypeAt(x, y, z)
    return type
  }

  getVoxelByWorldCoords = (x, y, z) => {
    const gbc = Helpers.worldToBlock({ x, y, z })
    return this.getVoxelByVoxelCoords(gbc.x, gbc.y, gbc.z)
  }

  getSolidityByVoxelCoords = (x, y, z, forPassing = false) => {
    const type = this.getVoxelByVoxelCoords(x, y, z)
    if (typeof type !== 'number') return forPassing

    const isSolid = forPassing
      ? Helpers.isPassable(type)
      : Helpers.isLiquid(type)
    return !isSolid
  }

  getSolidityByWorldCoords = (x, y, z) => {
    const gbc = Helpers.worldToBlock({ x, y, z })
    return this.getSolidityByVoxelCoords(gbc.x, gbc.y, gbc.z)
  }

  getPassableByVoxelCoords = (x, y, z) =>
    this.getSolidityByVoxelCoords(x, y, z, true)

  getTargetBlockType = () => {
    if (!this.targetBlock) return 0

    const {
      chunk: { cx, cy, cz },
      block: { x, y, z }
    } = this.targetBlock
    const bCoords = Helpers.chunkBlockToGlobalBlock({
      x,
      y,
      z,
      coordx: cx,
      coordy: cy,
      coordz: cz
    })

    return this.getVoxelByVoxelCoords(bCoords.x, bCoords.y, bCoords.z)
  }

  getIsReady = () => this.chunkManager.isReady

  breakBlock = (shouldGetBlock = true) => {
    if (!this.targetBlock) return // do nothing if no blocks are selected

    const todo = obtainedType => {
      if (obtainedType === 0 || !shouldGetBlock) return
      this.player.obtain(obtainedType, 1)
    }

    this.updateBlock(0, this.targetBlock, todo)
  }

  placeBlock = (type, shouldTakeBlock = true) => {
    if (!this.potentialBlock) return

    const todo = () => {
      if (shouldTakeBlock) this.player.takeFromHand(1)
    }

    this.updateBlock(type, this.potentialBlock, todo)
  }

  /**
   * General function controlling the worker task distribution
   * of placing/breaking blocks.
   *
   * @param {Int} type - Type of the prompted block.
   * @param {Object} blockData - Information about the prompted block
   *                    such as chunk coordinates and block position.
   * @param {Function} todo - Callback to be called after notifying the
   *                    workers about the changes to regenerate.
   */
  updateBlock = (type, blockData, todo) => {
    const {
      chunk: { cx, cy, cz },
      block
    } = blockData

    const mappedBlock = {
      x: cx * CHUNK_SIZE + block.x,
      y: cy * CHUNK_SIZE + block.y,
      z: cz * CHUNK_SIZE + block.z
    }
    const parentChunk = this.chunkManager.getChunkFromCoords(cx, cy, cz)

    const { x, y, z } = block

    if (this.chunkManager.checkBusyBlock(x, y, z)) return
    this.chunkManager.tagBusyBlock(x, y, z)
    // Communicating with server
    this.apolloClient
      .mutate({
        mutation: UPDATE_BLOCK_MUTATION,
        variables: {
          worldId: this.data.id,
          type,
          ...mappedBlock
        }
      })
      .then(() => {
        const obtainedType = parentChunk.getBlock(x, y, z)
        todo(obtainedType)
      })
      .catch(err => console.error(err))
  }

  updateChanged = ({ block }) => {
    console.log('UPDATE SUBSCRIPTION', block)
    if (!block) return
    const { node } = block

    const { coordx, coordy, coordz } = Helpers.globalBlockToChunkCoords(node)
    const chunkBlock = Helpers.globalBlockToChunkBlock(node)
    const { type, x: mx, y: my, z: mz } = node

    const targetChunk = this.chunkManager.getChunkFromCoords(
      coordx,
      coordy,
      coordz
    )
    targetChunk.setBlock(chunkBlock.x, chunkBlock.y, chunkBlock.z, type)

    this.chunkManager.markCB({
      type,
      x: mx,
      y: my,
      z: mz
    })
    ;[['x', 'coordx'], ['y', 'coordy'], ['z', 'coordz']].forEach(([a, c]) => {
      const nc = { coordx, coordy, coordz }
      const nb = { ...chunkBlock }
      let neighborAffected = false

      // If block is either on 0 or size, that means it has effects on neighboring chunks too.
      if (nb[a] === 0) {
        nc[c] -= 1
        nb[a] = CHUNK_SIZE
        neighborAffected = true
      } else if (nb[a] === CHUNK_SIZE - 1) {
        nc[c] += 1
        nb[a] = -1
        neighborAffected = true
      }
      if (neighborAffected) {
        const neighborChunk = this.chunkManager.getChunkFromCoords(
          nc.coordx,
          nc.coordy,
          nc.coordz
        )

        // Setting neighbor's block that represents self.
        neighborChunk.setBlock(nb.x, nb.y, nb.z, type)
        this.workerManager.queueGeneralChunk({
          cmd: 'UPDATE_BLOCK',
          data: neighborChunk.getData(),
          block: nb,
          chunkName: neighborChunk.getRep()
        })
      }
    })
    this.workerManager.queueGeneralChunk({
      cmd: 'UPDATE_BLOCK',
      data: targetChunk.getData(),
      block: chunkBlock,
      chunkName: targetChunk.getRep()
    })
  }
}

export default World
