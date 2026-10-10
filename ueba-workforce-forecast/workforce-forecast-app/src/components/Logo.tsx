import capgeminiBlue from '../assets/capgeminiBlue.svg'
import capgeminiWhite from '../assets/capgeminiWhite.svg'

export default function Logo({ suffix }: { suffix?: string }) {
  return (
    <div className="logo">
      <img className="logo-mark logo-mark-light" src={capgeminiBlue} height={26} alt="Capgemini" />
      <img className="logo-mark logo-mark-dark" src={capgeminiWhite} height={26} alt="Capgemini" />
      {suffix && <span className="logo-suffix">{suffix}</span>}
    </div>
  )
}
