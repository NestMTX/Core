import Env from '../env'

export default {
  secret: Env.get('APP_KEY'),
}
