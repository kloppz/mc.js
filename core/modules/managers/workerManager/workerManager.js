import Config from '../../../config/config'

import WorkerPool from './workerPool'
import TaskQueue from './taskQueue'

import * as THREE from 'three'

// import * as THREE from 'three'

const DIMENSION = Config.block.dimension
const P_I_2_TOE = Config.player.aabb.eye2toe
// const P_I_2_TOP = Config.player.aabb.eye2top

class WorkerManager {
  constructor(world) {
    this.world = world
  }

  initChunkPool = (instance, chunkManager, config) => {
    this.chunkManager = chunkManager

    this.chunkWorkerPool = new WorkerPool(instance, this.chunkCallback, config)
    this.chunkTaskQueue = new TaskQueue()
    this.chunkJobs = []
  }

  queueSpecificChunk = job => this.chunkWorkerPool.queueSJob(job)

  queueGeneralChunk = job => this.chunkWorkerPool.queueGJob(job)

  broadcastChunk = job => this.chunkWorkerPool.broadcast(job)

  chunkCallback = ({ data }) => {
    switch (data.cmd) {
      case 'GET_HIGHEST': {
        const { h } = data
        const position = this.world.player.getPosition()

        this.world.player.setPosition(
          position.x + DIMENSION / 2,
          (h + P_I_2_TOE + 1) * DIMENSION,
          position.z + DIMENSION / 2
        )

        this.world.setState({ isSetup: true })
        break
      }

      case 'GET_CHUNK': {
        const { meshData, blocks, chunkRep } = data
        const temp = this.chunkManager.getChunkFromRep(chunkRep)

        this.chunkTaskQueue.addTasks([
          [temp.setData, blocks],
          [this.chunkManager.meshChunk, [temp, meshData]]
        ])

        break
      }
      case 'UPDATE_BLOCK': {
        console.log('UPDATED', data)
        const {
          blocks,
          block: { x, y, z },
          meshData,
          chunkName
        } = data
        const temp = this.chunkManager.getChunkFromRep(chunkName)
        this.chunkTaskQueue.addTasks([
          [temp.setData, blocks],
          [this.chunkManager.meshChunk, [temp, meshData]]
        ])
        this.chunkTaskQueue.addTask(() => {
          // Remove old then add new to scene
          const obj = this.world.scene.getObjectByName(chunkName)
          if (obj) this.world.scene.remove(obj)
          const mesh = temp.getMesh()
          if (mesh instanceof THREE.Object3D) this.world.scene.add(mesh)
          this.chunkManager.untagBusyBlock(x, y, z)

          // Reset everything
          this.world.targetBlock = null
          this.world.potentialBlock = null
        })
        break
      }
      default:
        break
    }
  }

  update = () => {
    this.chunkWorkerPool.update()
    this.chunkTaskQueue.update()
  }
}

export default WorkerManager
