import PlayerSubscriptions from './playerSubscriptions'
import WorldSubscriptions from './worldSubscriptions'
import BlockSubscriptions from './blockSubscriptions'

export default {
  ...PlayerSubscriptions,
  ...WorldSubscriptions,
  ...BlockSubscriptions
}
