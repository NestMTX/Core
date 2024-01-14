import Env from '../env'

export default {
  start: Env.get('GSTREAMER_LAUNCH_PATH', '/usr/bin/gst-launch-1.0'),
  inspect: Env.get('GSTREAMER_INSPECT_PATH', '/usr/bin/gst-inspect-1.0'),
}
