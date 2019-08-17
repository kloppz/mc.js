import Helpers from '../../utils/helpers'

const BlockMutations = {
  updateBlock(parent, args, { prisma }, info) {
    const { x, y, z, type } = args.data
    const { id } = args.where
    const repr = Helpers.getBlockRep(id, x, y, z)

    return prisma.mutation.upsertBlock(
      {
        where: {
          representation: repr
        },
        create: {
          representation: repr,
          type,
          x,
          y,
          z,
          world: {
            connect: {
              id
            }
          }
        },
        update: {
          type
        }
      },
      info
    )
  }
}

export default BlockMutations
