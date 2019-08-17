import PlayerMutations from './playerMutations'
import UserMutations from './userMutations'
import WorldMutations from './worldMutations'
import BlockMutations from './blockMutations'

export default {
  ...PlayerMutations,
  ...UserMutations,
  ...WorldMutations,
  ...BlockMutations
}
