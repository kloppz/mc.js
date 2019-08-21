import Helpers from '../../../../utils/helpers'

export default class BaseGenerator {
  constructor(seed, changedBlocks) {
    this.changedBlocks = changedBlocks

    this.initSeed(seed)
  }

  initSeed = s => {
    let hash = 0
    let chr
    if (s.length === 0) return hash

    for (let i = 0; i < s.length; i++) {
      chr = s.charCodeAt(i)
      hash = (hash << 5) - hash + chr
      hash |= 0
    }

    if (hash > 0 && hash < 1) hash *= 65536

    hash = Math.floor(hash)

    this.seed = hash
  }

  registerCB = (x, y, z, type) => {
    const rep = Helpers.get3DCoordsRep(x, y, z)
    this.changedBlocks[rep] = type
  }

  isCBAt = (x, y, z) => {
    const cb = this.getCBAt(x, y, z)
    return Number.isInteger(cb)
  }

  /* -------------------------------------------------------------------------- */
  /*                                   GETTERS                                  */
  /* -------------------------------------------------------------------------- */
  getCBAt = (x, y, z) => {
    const rep = Helpers.get3DCoordsRep(x, y, z)
    const cb = this.changedBlocks[rep]
    if (Number.isInteger(cb)) return cb
    return undefined
  }
}
